// Copyright 2020 The Nakama Authors
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

const moduleName = "rps_js";
const tickRate = 1;
const maxEmptySec = 300;
const delaybetweenGamesSec = 5;
const turnTimeFastSec = 10;
const turnTimeNormalSec = 200;
//import { SyncRequestClient } from 'ts-sync-request/dist'


interface MatchLabel {
    open: number
    fast: number
}

interface State {
    // Match label
    label: MatchLabel
    // Ticks where no actions have occurred.
    emptyTicks: number
    // Currently connected users, or reserved spaces.
    presences: {[userId: string]: nkruntime.Presence | null}
    // Number of users currently in the process of connecting to the match.
    joinsInProgress: number
    // True if there's a game currently in progress.
    playing: boolean
    // Current state of the board.
    board: Board
    // Mark assignments to player user IDs.
    marks: {[userId: string]: number | null}
   
    // Ticks until they must submit their move.
    deadlineRemainingTicks: number
    // The winner of the current game.
    winner: number | null

    winnerId: string | null

    stage: number

    // Ticks until the next game starts, if applicable.
    nextGameRemainingTicks: number

    altmessage?: string
}

let matchInit: nkruntime.MatchInitFunction<State> = function (ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, params: {[key: string]: string}) {
    const fast = !!params['fast'];

    var label: MatchLabel = {
        open: 1,
        fast: 0,
    }
    if (fast) {
        label.fast = 1;
    }

    var state: State = {
        label: label,
        emptyTicks: 0,
        presences: {},
        joinsInProgress: 0,
        playing: false,
        board: [],
        marks: {},
        deadlineRemainingTicks: 0,
        winner: null,
        winnerId: null,
        nextGameRemainingTicks: 0,
        stage: 0,
    }

    return {
        state,
        tickRate,
        label: JSON.stringify(label),
    }
}

let matchJoinAttempt: nkruntime.MatchJoinAttemptFunction<State> = function (ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, dispatcher: nkruntime.MatchDispatcher, tick: number, state: State, presence: nkruntime.Presence, metadata: {[key: string]: any}) {
    // Check if it's a user attempting to rejoin after a disconnect.
    if (presence.userId in state.presences) {
        if (state.presences[presence.userId] === null) {
            // User rejoining after a disconnect.
            state.joinsInProgress++;
            return {
                state: state,
                accept: false,
            }
        } else {
            // User attempting to join from 2 different devices at the same time.
            return {
                state: state,
                accept: false,
                rejectMessage: 'already joined',
            }
        }
    }

    // Check if match is full.
    if (connectedPlayers(state) + state.joinsInProgress >= 2) {
        return {
            state: state,
            accept: false,
            rejectMessage: 'match full',
        };
    }

    // New player attempting to connect.
    state.joinsInProgress++;
    return {
        state,
        accept: true,
    }
}

let matchJoin: nkruntime.MatchJoinFunction<State> = function(ctx: nkruntime.Context,
        logger: nkruntime.Logger,
        nk: nkruntime.Nakama,
        dispatcher: nkruntime.MatchDispatcher,
        tick: number,
        state: State,
        presences: nkruntime.Presence[]) {
    const t = msecToSec(Date.now());

    for (const presence of presences) {
        state.emptyTicks = 0;
        state.presences[presence.userId] = presence;
        state.joinsInProgress--;

        // Check if we must send a message to this user to update them on the current game state.
        if (state.playing) {
            // There's a game still currently in progress, the player is re-joining after a disconnect. Give them a state update.
            let update: UpdateMessage = {
                stage: state.stage,
                board: state.board,                
                deadline: t + Math.floor(state.deadlineRemainingTicks/tickRate),
            }
            // Send a message to the user that just joined.
            dispatcher.broadcastMessage(OpCode.UPDATE, JSON.stringify(update));
        } else if (state.board.length !== 0 && Object.keys(state.marks).length !== 0 && state.marks[presence.userId]) {
            logger.debug('player %s rejoined game', presence.userId);
            // There's no game in progress but we still have a completed game that the user was part of.
            // They likely disconnected before the game ended, and have since forfeited because they took too long to return.
            let done: DoneMessage = {
                board: state.board,
                winner: state.winner,    
                winnerId: state.winnerId,            
                nextGameStart: t + Math.floor(state.nextGameRemainingTicks/tickRate)
            }
            // Send a message to the user that just joined.
            dispatcher.broadcastMessage(OpCode.DONE, JSON.stringify(done))
        }
    }

    // Check if match was open to new players, but should now be closed.
    if (Object.keys(state.presences).length >= 2 && state.label.open != 0) {
        state.label.open = 0;
        const labelJSON = JSON.stringify(state.label);
        dispatcher.matchLabelUpdate(labelJSON);
    }

    return {state};
}

let matchLeave: nkruntime.MatchLeaveFunction<State> = function(ctx: nkruntime.Context, logger: nkruntime.Logger,
      nk: nkruntime.Nakama, dispatcher: nkruntime.MatchDispatcher,
      tick: number, state: State, 
      presences: nkruntime.Presence[]) {
    for (let presence of presences) {
        logger.info("Player: %s left match: %s.", presence.userId, ctx.matchId);
        state.presences[presence.userId] = null;
    }

    return {state};
}

let matchLoop: nkruntime.MatchLoopFunction<State> = function(ctx: nkruntime.Context, logger: nkruntime.Logger, 
      nk: nkruntime.Nakama, dispatcher: nkruntime.MatchDispatcher, 
      tick: number, state: State, 
      messages: nkruntime.MatchMessage[]) {
    //logger.debug('Running match loop. Tick: %d', tick);
    //logger.debug('Playing:'+state.playing);
    
    if (connectedPlayers(state) + state.joinsInProgress === 0) {
        state.emptyTicks++;
        if (state.emptyTicks >= maxEmptySec * tickRate) {
            // Match has been empty for too long, close it.
            logger.info('closing idle match');
            return null;
        }
    }

    let t = msecToSec(Date.now());

    // If there's no game in progress check if we can (and should) start one!
    if (!state.playing) {
        // Between games any disconnected users are purged, there's no in-progress game for them to return to anyway.
        for (let userID in state.presences) {
            if (state.presences[userID] === null) {
                delete state.presences[userID];
            }
        }

        // Check if we need to update the label so the match now advertises itself as open to join.
        if (Object.keys(state.presences).length < 2 && state.label.open != 1) {
            state.label.open = 1;
            let labelJSON = JSON.stringify(state.label);
            dispatcher.matchLabelUpdate(labelJSON);
        }

        // Check if we have enough players to start a game.
        if (Object.keys(state.presences).length < 2) {
            return { state };
        }

        //logger.debug('Remaining till next:'+state.nextGameRemainingTicks);

        // Check if enough time has passed since the last game.
        if (state.nextGameRemainingTicks > 0) {
            state.nextGameRemainingTicks--
            return { state };
        }

        // We can start a game! Set up the game state and assign the marks to each player.
        logger.debug('Starting:');        
        let url = "http://host.docker.internal/GameEngineServer/hands";
        //let headers = { 'Accept': 'application/json' };
        let response = nk.httpRequest(url, 'get');
        logger.debug("requested");        

        state.altmessage = response.body;   
        logger.debug("got " +state.altmessage);        

        state.playing = true;
        state.board = new Array(2);
        state.marks = {};
        let nums = [0,1];
        Object.keys(state.presences).forEach(userId => {
            state.marks[userId] = nums.shift() ?? null;
        });
        logger.debug('presences:' + JSON.stringify(state.marks));        
        state.winner = null;
        state.winnerId = null;        
        state.deadlineRemainingTicks = calculateDeadlineTicks(state.label);
        state.nextGameRemainingTicks = 0;

        for (let key in state.marks) {
            // Notify the players a new game has started.
            let msg: StartMessage = {
                board: state.board,
                marks: state.marks,            
                deadline: t + Math.floor(state.deadlineRemainingTicks / tickRate),
                hand:[state.marks[key]??-1]
            }

            let press = null;
            
            if (state.presences[key]!==null) {
                let press1 = state.presences[key];            
                dispatcher.broadcastMessage(OpCode.START, JSON.stringify(msg),[press1!!]);
            }
            
        }

        return { state };
    }

    // There's a game in progresstate. Check for input, update match state, and send messages to clientstate.
    for (const message of messages) {
        switch (message.opCode) {
            case OpCode.MOVE:
                logger.debug('Received move message from user: %v', state.marks);
                
                let mark = state.marks[message.sender.userId] ?? null;               

                let msg = {} as MoveMessage;
                try {
                    //logger.debug('Not Bad data receivedv: %v', message.data);

                    let st = nk.binaryToString(message.data);
                    logger.debug('Not Bad data receiveds: %s', st);
                    msg = JSON.parse(st);
                } catch (error) {
                    // Client sent bad data.
                    dispatcher.broadcastMessage(OpCode.REJECTED, null, [message.sender]);
                    logger.debug('Bad data receiveda: %v', error);
                    continue;
                }
                if (mark===null || state.board[mark]) {
                    logger.debug('rejected'+ mark);
                    if (mark){
                        logger.debug('rejected'+ state.board[mark]);
                    }

                    // Client sent a position outside the board, or one that has already been played.
                    dispatcher.broadcastMessage(OpCode.REJECTED, null, [message.sender]);
                    continue;
                }
                logger.debug('New position PLAYER:'+mark);
                logger.debug('New position VALUE:'+msg.position);

                
                // Update the game state.
                state.board[mark] = msg.position;
                
                state.deadlineRemainingTicks = calculateDeadlineTicks(state.label);

                // Check if game is over through a winning move.
                if (state.board[0]!=null && state.board[1]!=null) {
                    const [winner, winningPos] = winCheck(state.board, mark);
                    if (winner) {
                        state.winner = winningPos;
                        state.winnerId = null;

                        for (let key in state.marks) {
                            if (state.marks[key] == winningPos) {
                                state.winnerId = key; 
                                break;
                            }
                        }
                        state.playing = false;
                        state.deadlineRemainingTicks = 0;
                        state.nextGameRemainingTicks = delaybetweenGamesSec * tickRate;
                        logger.debug('Winner:'+winningPos);

                    }
                    // Check if game is over because no more moves are possible.
                    let tie = !winner;
                    if (tie) {
                        // Update state to reflect the tie, and schedule the next game.
                        state.playing = false;
                        state.deadlineRemainingTicks = 0;
                        state.nextGameRemainingTicks = delaybetweenGamesSec * tickRate;
                        logger.debug('Tie:');

                    }
                }

                let opCode: OpCode
                let outgoingMsg: Message
                if (state.playing) {
                    opCode = OpCode.UPDATE
                    let msg: UpdateMessage = {
                        board: state.board,
                        stage: 1,
                        deadline: t + Math.floor(state.deadlineRemainingTicks/tickRate),
                    }
                    outgoingMsg = msg;
                } else {
                    opCode = OpCode.DONE
                    let msg: DoneMessage = {
                        board: state.board,
                        winner: state.winner,
                        winnerId:state.winnerId,
                        nextGameStart: t + Math.floor(state.nextGameRemainingTicks/tickRate),
                    }
                    outgoingMsg = msg;
                    logger.debug('board:',JSON.stringify(state.board));
                    
                }
                dispatcher.broadcastMessage(opCode, JSON.stringify(outgoingMsg));
                break;
            default:
                // No other opcodes are expected from the client, so automatically treat it as an error.
                dispatcher.broadcastMessage(OpCode.REJECTED, null, [message.sender]);
                logger.error('Unexpected opcode received: %d', message.opCode);
        }
    }

    // Keep track of the time remaining for the player to submit their move. Idle players forfeit.
    if (state.playing) {
        state.deadlineRemainingTicks--;
        if (state.deadlineRemainingTicks <= 0 ) {
            // The player has run out of time to submit their move.
            state.playing = false;
            let winner = -1
            if (state.board[0] === state.board[1] && state.board[0] === null) {

            } else {
                if (state.board[0] === null) {
                    winner = 1
                } else {
                    winner = 0
                }
            }
            state.winner = winner;
            state.deadlineRemainingTicks = 0;
            state.nextGameRemainingTicks = delaybetweenGamesSec * tickRate;

            let msg: DoneMessage = {
                board: state.board,
                winner: state.winner,
                winnerId: state.winnerId,

                nextGameStart: t + Math.floor(state.nextGameRemainingTicks/tickRate),                
            }
            dispatcher.broadcastMessage(OpCode.DONE, JSON.stringify(msg));
        } else {
            //logger.debug('Ticks remaining:'+ state.deadlineRemainingTicks);
        }
    }

    return { state };
}

let matchTerminate: nkruntime.MatchTerminateFunction<State> = function(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, dispatcher: nkruntime.MatchDispatcher, tick: number, state: State, graceSeconds: number) {
    return { state };
}

let matchSignal: nkruntime.MatchSignalFunction<State> = function(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, dispatcher: nkruntime.MatchDispatcher, tick: number, state: State) {
    return { state };
}

function calculateDeadlineTicks(l: MatchLabel): number {
    if (l.fast === 1) {
        return turnTimeFastSec * tickRate;
    } else {
        return turnTimeNormalSec * tickRate;
    }
}

function winCheck(board: Board, mark: Mark): [boolean, number] {
    let res0 = [false, -1];
    let res1 = [true, 0];
    let res2 = [true, 1];


    if (board[0] == Val.PAPER) {
        if (board[1] == Val.PAPER) {
            return [false, -1];
        }
        if (board[1] == Val.ROCK) {
            return [true, 0];
        } 
        if (board[1] == Val.SCISSORS) {
            return [true, 1];
        }  
    }

    if (board[0] == Val.ROCK) {
        if (board[1] == Val.ROCK) {
            return [false, -1];
        }
        if (board[1] == Val.PAPER) {
            return [true, 1];
        } 
        if (board[1] == Val.SCISSORS) {
            return [true, 0];
        }  
    }

    if (board[0] == Val.SCISSORS) {
        if (board[1] == Val.SCISSORS) {
            return [false, -1];
        }
        if (board[1] == Val.ROCK) {
            return [true, 1];
        } 
        if (board[1] == Val.PAPER) {
            return [true, 0];
        }  
    }

    return [false, -1];
}

function connectedPlayers(s: State): number {
    let count = 0;
    for(const p of Object.keys(s.presences)) {
        if (p !== null) {
            count++;
        }
    }
    return count;
}
