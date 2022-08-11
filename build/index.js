"use strict";
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
var rpcIdRewards = 'rewards_js';
var rpcIdFindMatch = 'find_match_js';
function InitModule(ctx, logger, nk, initializer) {
    initializer.registerRpc(rpcIdRewards, rpcReward);
    initializer.registerRpc(rpcIdFindMatch, rpcFindMatch);
    initializer.registerMatch(moduleName, {
        matchInit: matchInit,
        matchJoinAttempt: matchJoinAttempt,
        matchJoin: matchJoin,
        matchLeave: matchLeave,
        matchLoop: matchLoop,
        matchTerminate: matchTerminate,
        matchSignal: matchSignal,
    });
    logger.info('JavaScript logic loaded.');
}
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
function rpcReward(context, logger, nk, payload) {
    if (!context.userId) {
        throw Error('No user ID in context');
    }
    if (payload) {
        throw Error('no input allowed');
    }
    var objectId = {
        collection: 'reward',
        key: 'daily',
        userId: context.userId,
    };
    var objects;
    try {
        objects = nk.storageRead([objectId]);
    }
    catch (error) {
        logger.error('storageRead error: %s', error);
        throw error;
    }
    var dailyReward = {
        lastClaimUnix: 0,
    };
    objects.forEach(function (object) {
        if (object.key == 'daily') {
            dailyReward = object.value;
        }
    });
    var resp = {
        coinsReceived: 0,
    };
    var d = new Date();
    d.setHours(0, 0, 0, 0);
    // If last claimed is before the new day grant a new reward!
    if (dailyReward.lastClaimUnix < msecToSec(d.getTime())) {
        resp.coinsReceived = 500;
        // Update player wallet.
        var changeset = {
            coins: resp.coinsReceived,
        };
        try {
            nk.walletUpdate(context.userId, changeset, {}, false);
        }
        catch (error) {
            logger.error('walletUpdate error: %q', error);
            throw error;
        }
        var notification = {
            code: 1001,
            content: changeset,
            persistent: true,
            subject: "You've received your daily reward!",
            userId: context.userId,
        };
        try {
            nk.notificationsSend([notification]);
        }
        catch (error) {
            logger.error('notificationsSend error: %q', error);
            throw error;
        }
        dailyReward.lastClaimUnix = msecToSec(Date.now());
        var write = {
            collection: 'reward',
            key: 'daily',
            permissionRead: 1,
            permissionWrite: 0,
            value: dailyReward,
            userId: context.userId,
        };
        if (objects.length > 0) {
            write.version = objects[0].version;
        }
        try {
            nk.storageWrite([write]);
        }
        catch (error) {
            logger.error('storageWrite error: %q', error);
            throw error;
        }
    }
    var result = JSON.stringify(resp);
    logger.debug('rpcReward resp: %q', result);
    return result;
}
function msecToSec(n) {
    return Math.floor(n / 1000);
}
var Mark;
(function (Mark) {
    Mark[Mark["X"] = 0] = "X";
    Mark[Mark["O"] = 1] = "O";
    Mark[Mark["UNDEFINED"] = 2] = "UNDEFINED";
})(Mark || (Mark = {}));
// The complete set of opcodes used for communication between clients and server.
var OpCode;
(function (OpCode) {
    // New game round starting.
    OpCode[OpCode["START"] = 1] = "START";
    // Update to the state of an ongoing round.
    OpCode[OpCode["UPDATE"] = 2] = "UPDATE";
    // A game round has just completed.
    OpCode[OpCode["DONE"] = 3] = "DONE";
    // A move the player wishes to make and sends to the server.
    OpCode[OpCode["MOVE"] = 4] = "MOVE";
    // Move was rejected.
    OpCode[OpCode["REJECTED"] = 5] = "REJECTED";
})(OpCode || (OpCode = {}));
var Val;
(function (Val) {
    Val[Val["ROCK"] = 1] = "ROCK";
    Val[Val["PAPER"] = 2] = "PAPER";
    Val[Val["SCISSORS"] = 3] = "SCISSORS";
})(Val || (Val = {}));
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
var moduleName = "rps_js";
var tickRate = 1;
var maxEmptySec = 300;
var delaybetweenGamesSec = 5;
var turnTimeFastSec = 10;
var turnTimeNormalSec = 200;
var matchInit = function (ctx, logger, nk, params) {
    var fast = !!params['fast'];
    var label = {
        open: 1,
        fast: 0,
    };
    if (fast) {
        label.fast = 1;
    }
    var state = {
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
    };
    return {
        state: state,
        tickRate: tickRate,
        label: JSON.stringify(label),
    };
};
var matchJoinAttempt = function (ctx, logger, nk, dispatcher, tick, state, presence, metadata) {
    // Check if it's a user attempting to rejoin after a disconnect.
    if (presence.userId in state.presences) {
        if (state.presences[presence.userId] === null) {
            // User rejoining after a disconnect.
            state.joinsInProgress++;
            return {
                state: state,
                accept: false,
            };
        }
        else {
            // User attempting to join from 2 different devices at the same time.
            return {
                state: state,
                accept: false,
                rejectMessage: 'already joined',
            };
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
        state: state,
        accept: true,
    };
};
var matchJoin = function (ctx, logger, nk, dispatcher, tick, state, presences) {
    var t = msecToSec(Date.now());
    for (var _i = 0, presences_1 = presences; _i < presences_1.length; _i++) {
        var presence = presences_1[_i];
        state.emptyTicks = 0;
        state.presences[presence.userId] = presence;
        state.joinsInProgress--;
        // Check if we must send a message to this user to update them on the current game state.
        if (state.playing) {
            // There's a game still currently in progress, the player is re-joining after a disconnect. Give them a state update.
            var update = {
                stage: state.stage,
                board: state.board,
                deadline: t + Math.floor(state.deadlineRemainingTicks / tickRate),
            };
            // Send a message to the user that just joined.
            dispatcher.broadcastMessage(OpCode.UPDATE, JSON.stringify(update));
        }
        else if (state.board.length !== 0 && Object.keys(state.marks).length !== 0 && state.marks[presence.userId]) {
            logger.debug('player %s rejoined game', presence.userId);
            // There's no game in progress but we still have a completed game that the user was part of.
            // They likely disconnected before the game ended, and have since forfeited because they took too long to return.
            var done = {
                board: state.board,
                winner: state.winner,
                winnerId: state.winnerId,
                nextGameStart: t + Math.floor(state.nextGameRemainingTicks / tickRate)
            };
            // Send a message to the user that just joined.
            dispatcher.broadcastMessage(OpCode.DONE, JSON.stringify(done));
        }
    }
    // Check if match was open to new players, but should now be closed.
    if (Object.keys(state.presences).length >= 2 && state.label.open != 0) {
        state.label.open = 0;
        var labelJSON = JSON.stringify(state.label);
        dispatcher.matchLabelUpdate(labelJSON);
    }
    return { state: state };
};
var matchLeave = function (ctx, logger, nk, dispatcher, tick, state, presences) {
    for (var _i = 0, presences_2 = presences; _i < presences_2.length; _i++) {
        var presence = presences_2[_i];
        logger.info("Player: %s left match: %s.", presence.userId, ctx.matchId);
        state.presences[presence.userId] = null;
    }
    return { state: state };
};
var matchLoop = function (ctx, logger, nk, dispatcher, tick, state, messages) {
    //logger.debug('Running match loop. Tick: %d', tick);
    //logger.debug('Playing:'+state.playing);
    var _a, _b;
    if (connectedPlayers(state) + state.joinsInProgress === 0) {
        state.emptyTicks++;
        if (state.emptyTicks >= maxEmptySec * tickRate) {
            // Match has been empty for too long, close it.
            logger.info('closing idle match');
            return null;
        }
    }
    var t = msecToSec(Date.now());
    // If there's no game in progress check if we can (and should) start one!
    if (!state.playing) {
        // Between games any disconnected users are purged, there's no in-progress game for them to return to anyway.
        for (var userID in state.presences) {
            if (state.presences[userID] === null) {
                delete state.presences[userID];
            }
        }
        // Check if we need to update the label so the match now advertises itself as open to join.
        if (Object.keys(state.presences).length < 2 && state.label.open != 1) {
            state.label.open = 1;
            var labelJSON = JSON.stringify(state.label);
            dispatcher.matchLabelUpdate(labelJSON);
        }
        // Check if we have enough players to start a game.
        if (Object.keys(state.presences).length < 2) {
            return { state: state };
        }
        //logger.debug('Remaining till next:'+state.nextGameRemainingTicks);
        // Check if enough time has passed since the last game.
        if (state.nextGameRemainingTicks > 0) {
            state.nextGameRemainingTicks--;
            return { state: state };
        }
        // We can start a game! Set up the game state and assign the marks to each player.
        logger.debug('Starting:');
        var url = "http://host.docker.internal/GameEngineServer/hands";
        //let headers = { 'Accept': 'application/json' };
        var response = nk.httpRequest(url, 'get');
        logger.debug("requested");
        state.altmessage = response.body;
        logger.debug("got " + state.altmessage);
        state.playing = true;
        state.board = new Array(2);
        state.marks = {};
        var nums_1 = [0, 1];
        Object.keys(state.presences).forEach(function (userId) {
            var _a;
            state.marks[userId] = (_a = nums_1.shift()) !== null && _a !== void 0 ? _a : null;
        });
        logger.debug('presences:' + JSON.stringify(state.marks));
        state.winner = null;
        state.winnerId = null;
        state.deadlineRemainingTicks = calculateDeadlineTicks(state.label);
        state.nextGameRemainingTicks = 0;
        for (var key in state.marks) {
            // Notify the players a new game has started.
            var msg = {
                board: state.board,
                marks: state.marks,
                deadline: t + Math.floor(state.deadlineRemainingTicks / tickRate),
                hand: [(_a = state.marks[key]) !== null && _a !== void 0 ? _a : -1]
            };
            var press = null;
            if (state.presences[key] !== null) {
                var press1 = state.presences[key];
                dispatcher.broadcastMessage(OpCode.START, JSON.stringify(msg), [press1]);
            }
        }
        return { state: state };
    }
    // There's a game in progresstate. Check for input, update match state, and send messages to clientstate.
    for (var _i = 0, messages_1 = messages; _i < messages_1.length; _i++) {
        var message = messages_1[_i];
        switch (message.opCode) {
            case OpCode.MOVE:
                logger.debug('Received move message from user: %v', state.marks);
                var mark = (_b = state.marks[message.sender.userId]) !== null && _b !== void 0 ? _b : null;
                var msg = {};
                try {
                    //logger.debug('Not Bad data receivedv: %v', message.data);
                    var st = nk.binaryToString(message.data);
                    logger.debug('Not Bad data receiveds: %s', st);
                    msg = JSON.parse(st);
                }
                catch (error) {
                    // Client sent bad data.
                    dispatcher.broadcastMessage(OpCode.REJECTED, null, [message.sender]);
                    logger.debug('Bad data receiveda: %v', error);
                    continue;
                }
                if (mark === null || state.board[mark]) {
                    logger.debug('rejected' + mark);
                    if (mark) {
                        logger.debug('rejected' + state.board[mark]);
                    }
                    // Client sent a position outside the board, or one that has already been played.
                    dispatcher.broadcastMessage(OpCode.REJECTED, null, [message.sender]);
                    continue;
                }
                logger.debug('New position PLAYER:' + mark);
                logger.debug('New position VALUE:' + msg.position);
                // Update the game state.
                state.board[mark] = msg.position;
                state.deadlineRemainingTicks = calculateDeadlineTicks(state.label);
                // Check if game is over through a winning move.
                if (state.board[0] != null && state.board[1] != null) {
                    var _c = winCheck(state.board, mark), winner = _c[0], winningPos = _c[1];
                    if (winner) {
                        state.winner = winningPos;
                        state.winnerId = null;
                        for (var key in state.marks) {
                            if (state.marks[key] == winningPos) {
                                state.winnerId = key;
                                break;
                            }
                        }
                        state.playing = false;
                        state.deadlineRemainingTicks = 0;
                        state.nextGameRemainingTicks = delaybetweenGamesSec * tickRate;
                        logger.debug('Winner:' + winningPos);
                    }
                    // Check if game is over because no more moves are possible.
                    var tie = !winner;
                    if (tie) {
                        // Update state to reflect the tie, and schedule the next game.
                        state.playing = false;
                        state.deadlineRemainingTicks = 0;
                        state.nextGameRemainingTicks = delaybetweenGamesSec * tickRate;
                        logger.debug('Tie:');
                    }
                }
                var opCode = void 0;
                var outgoingMsg = void 0;
                if (state.playing) {
                    opCode = OpCode.UPDATE;
                    var msg_1 = {
                        board: state.board,
                        stage: 1,
                        deadline: t + Math.floor(state.deadlineRemainingTicks / tickRate),
                    };
                    outgoingMsg = msg_1;
                }
                else {
                    opCode = OpCode.DONE;
                    var msg_2 = {
                        board: state.board,
                        winner: state.winner,
                        winnerId: state.winnerId,
                        nextGameStart: t + Math.floor(state.nextGameRemainingTicks / tickRate),
                    };
                    outgoingMsg = msg_2;
                    logger.debug('board:', JSON.stringify(state.board));
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
        if (state.deadlineRemainingTicks <= 0) {
            // The player has run out of time to submit their move.
            state.playing = false;
            var winner = -1;
            if (state.board[0] === state.board[1] && state.board[0] === null) {
            }
            else {
                if (state.board[0] === null) {
                    winner = 1;
                }
                else {
                    winner = 0;
                }
            }
            state.winner = winner;
            state.deadlineRemainingTicks = 0;
            state.nextGameRemainingTicks = delaybetweenGamesSec * tickRate;
            var msg = {
                board: state.board,
                winner: state.winner,
                winnerId: state.winnerId,
                nextGameStart: t + Math.floor(state.nextGameRemainingTicks / tickRate),
            };
            dispatcher.broadcastMessage(OpCode.DONE, JSON.stringify(msg));
        }
        else {
            //logger.debug('Ticks remaining:'+ state.deadlineRemainingTicks);
        }
    }
    return { state: state };
};
var matchTerminate = function (ctx, logger, nk, dispatcher, tick, state, graceSeconds) {
    return { state: state };
};
var matchSignal = function (ctx, logger, nk, dispatcher, tick, state) {
    return { state: state };
};
function calculateDeadlineTicks(l) {
    if (l.fast === 1) {
        return turnTimeFastSec * tickRate;
    }
    else {
        return turnTimeNormalSec * tickRate;
    }
}
function winCheck(board, mark) {
    var res0 = [false, -1];
    var res1 = [true, 0];
    var res2 = [true, 1];
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
function connectedPlayers(s) {
    var count = 0;
    for (var _i = 0, _a = Object.keys(s.presences); _i < _a.length; _i++) {
        var p = _a[_i];
        if (p !== null) {
            count++;
        }
    }
    return count;
}
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
var rpcFindMatch = function (ctx, logger, nk, payload) {
    if (!ctx.userId) {
        throw Error('No user ID in context');
    }
    if (!payload) {
        throw Error('Expects payload.');
    }
    var request = {};
    try {
        request = JSON.parse(payload);
    }
    catch (error) {
        logger.error('Error parsing json message: %q', error);
        throw error;
    }
    var matches;
    try {
        var query = "+label.open:1 +label.fast:".concat(request.fast ? 1 : 0);
        matches = nk.matchList(10, true, null, null, 1, query);
    }
    catch (error) {
        logger.error('Error listing matches: %v', error);
        throw error;
    }
    var matchIds = [];
    if (matches.length > 0) {
        // There are one or more ongoing matches the user could join.
        matchIds = matches.map(function (m) { return m.matchId; });
    }
    else {
        // No available matches found, create a new one.
        try {
            matchIds.push(nk.matchCreate(moduleName, { fast: request.fast }));
        }
        catch (error) {
            logger.error('Error creating match: %v', error);
            throw error;
        }
    }
    var res = { matchIds: matchIds };
    return JSON.stringify(res);
};
