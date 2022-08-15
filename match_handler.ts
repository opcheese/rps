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
    boardNum: number
    moves:{[userId: string]: number | null}
    randomOrder: number,
    // Mark assignments to player user IDs.
    marks: {[userId: string]: number | null}
    hands: {[userId: string]: Hand | null}

   
    // Ticks until they must submit their move.
    deadlineRemainingTicks: number
    // The winner of the current game.
    winner: number | null

    winnerId: string | null

    stage: number

    // Ticks until the next game starts, if applicable.
    nextGameRemainingTicks: number

    altmessage?: string
    winnerLog: string|null
    

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
        boardNum:-1,
        marks: {},
        hands:{},
        moves:{},
        randomOrder:-1,
        deadlineRemainingTicks: 0,
        winner: null,
        winnerId: null,
        nextGameRemainingTicks: 0,
        stage: 0,
        winnerLog:null
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
                logs: state.winnerLog??"",            
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
    return null;
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
        state.winnerLog = null;
        let urlRules = "http://host.docker.internal:8000/GameEngineServer/rules";
        let headers = { 'Accept': 'application/json' };
        let responseRules = nk.httpRequest(urlRules, 'get',headers);
        let rules = JSON.parse(responseRules.body);
        let url = "http://host.docker.internal:8000/GameEngineServer/hands";
        //let headers = { 'Accept': 'application/json' };
        let response = nk.httpRequest(url, 'get');
        logger.debug("requested");        

        state.altmessage = response.body;  
        let parsed = JSON.parse(state.altmessage);
        let winners = JSON.stringify(parsed.winners);
        let strat0 = parsed.strat0;
        //logger.debug("got 1:" + strat0);   
        let strat1 = parsed.strat1;
        let regret0 = JSON.stringify(parsed.regret0);
        let regret1 = JSON.stringify(parsed.regret1);
        let winnerStat0 = JSON.stringify(parsed.winner_stat0);
        let winnerStat1 = JSON.stringify(parsed.winner_stat1);


        logger.debug("got " +JSON.stringify(parsed));       
        let lefthand: Hand = parsed.left;
        logger.debug("left hand " +JSON.stringify(lefthand));       


        let righthand: Hand = parsed.right;
        logger.debug("right hand " +JSON.stringify(righthand));       

        state.board = [lefthand,righthand]
        state.boardNum = parseInt(parsed.num);

        state.playing = true;        
        state.marks = {};
        let nums = [0,1];
        Object.keys(state.presences).forEach((userId,ind) => {
            logger.debug("state ind " + ind);
            logger.debug("state nums " + nums[ind]);
            logger.debug("state board " + state.board[ind]);
            
            state.marks[userId] = nums[ind];//nums.shift() ?? null;

            state.hands[userId] = state.board[ind]
        });
        logger.debug("state hands " +JSON.stringify(state.hands));
        logger.debug("state marks " +JSON.stringify(state.marks));       


        logger.debug('presences:' + JSON.stringify(state.marks));        
        state.winner = null;
        state.winnerId = null;        
        state.deadlineRemainingTicks = calculateDeadlineTicks(state.label);
        state.nextGameRemainingTicks = 0;



        let cou = -1;
        for (let key in state.marks) {           
            cou++;
            // Notify the players a new game has started.
            let msg: StartMessage = {                
                marks: state.marks,  
                hand: state.hands[key],
                rules:rules,
                number: cou,
                winners:winners,
                regrets:[regret0,regret1],
                strats:[strat0,strat1],
                winnerStats:[winnerStat0,winnerStat1],      

                deadline: t + Math.floor(state.deadlineRemainingTicks / tickRate),                
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
                if (mark===null || state.moves[mark]) {
                    logger.debug('rejected!' + mark);
                    if (msg.position>2){
                        logger.debug('rejected '+ msg.position);
                    }
                   
                    // Client sent a position outside the board, or one that has already been played.
                    dispatcher.broadcastMessage(OpCode.REJECTED, null, [message.sender]);
                    continue;
                }
                logger.debug('New position PLAYER:'+mark);
                logger.debug('New position VALUE:'+msg.position);

                state.moves[mark] = msg.position;
                // Update the game state.
                //state.board[mark] = msg.position;
                
                state.deadlineRemainingTicks = calculateDeadlineTicks(state.label);

                // Check if game is over through a winning move.
                if (state.moves[0]!=null && state.moves[1]!=null) {
                    let random_order = Math.floor(Math.random() * 4);
                    state.randomOrder = random_order;
                    logger.debug('New random value:'+state.randomOrder );
                    let lh = [...state.board[0]??[]];
                    let rh = [...state.board[1]??[]];
                    lh.splice(state.moves[0], 1);
                    rh.splice(state.moves[1], 1);
                    switch (random_order){
                        case 0:                             
                            break;
                        case 1:
                            lh = lh.reverse();
                            break;
                        case 2:
                            rh = rh.reverse();
                            break;
                        case 3: 
                            lh = lh.reverse();
                            rh = rh.reverse();
                            break;
                        default: throw Error("wrong order");

                    }
                    let handStr = "";
                    let lstr = lh.reduce((all,one)=>all+","+one,"").substring(1);
                    let rstr = rh.reduce((all,one)=>all+","+one,"").substring(1);
                    handStr = lstr+"|"+rstr;
                    logger.debug('New handStr:'+handStr );
                    
                    let urlRules = "http://host.docker.internal:8000/GameEngineServer/battle?hands="+handStr;
                    let headers = { 'Accept': 'application/json' };
                    let responseRules = nk.httpRequest(urlRules, 'get',headers);
                    let battleRes = JSON.parse(responseRules.body);                    
                    let winnerPos = -2;
                    state.winner = battleRes.winner;
                    if (state.winner == 1) {
                        winnerPos = 1;
                    }
                    if (state.winner == -1) {
                        winnerPos = 0;
                    }
                    state.winnerId = null;
                    state.winnerLog = battleRes.logs;

                    for (let key in state.marks) {
                        if (state.marks[key] == winnerPos) {
                            state.winnerId = key; 
                            break;
                        }
                    }
                    state.playing = false;
                    state.deadlineRemainingTicks = 0;
                    state.nextGameRemainingTicks = delaybetweenGamesSec * tickRate;
                    logger.debug('Winner:'+state.winner);
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
                        logs: state.winnerLog??"",
                        nextGameStart: t + Math.floor(state.nextGameRemainingTicks/tickRate),
                    }
                    outgoingMsg = msg;
                    logger.debug('board:',JSON.stringify(state.board));
                    
                    state.winnerLog = null;
                    state.winner = null;
                    state.winnerId = null;
                    state.marks = {};
                    state.moves = {};
                    
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
                logs: state.winnerLog??"",
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
