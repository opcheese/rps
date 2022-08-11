enum Mark {
    X = 0,
    O = 1,
    UNDEFINED = 2,
}

// The complete set of opcodes used for communication between clients and server.
enum OpCode {
	// New game round starting.
	START = 1,
	// Update to the state of an ongoing round.
	UPDATE = 2,
	// A game round has just completed.
	DONE = 3,
	// A move the player wishes to make and sends to the server.
	MOVE = 4,
	// Move was rejected.
	REJECTED = 5
}

enum Val {

	ROCK = 1,

	PAPER = 2,

	SCISSORS = 3,

}

type Message = StartMessage|UpdateMessage|DoneMessage|MoveMessage|RpcFindMatchRequest|RpcFindMatchResponse
type Board = (Hand|null)[]


type Hand = (number)[]

// Message data sent by server to clients representing a new game round starting.
interface StartMessage {    
    // The assignments of the marks to players for this round.
    marks: {[userID: string]: number|null},

    hand: Hand|null

    // The deadline time by which the player must submit their move, or forfeit.
    deadline: number
}

// A game state update sent by the server to clients.
interface UpdateMessage {
    // The current state of the board.
    board: Board
    // Whose turn it is to play.
    stage: number
    // The deadline time by which the player must submit their move, or forfeit.
    deadline: number
}

// Complete game round with winner announcement.
interface DoneMessage {
    // The final state of the board.
    board: Board
    // The winner of the game, if any. Unspecified if it's a draw.
    winner: number | null
    winnerId: string | null    
    // Next round start time.
    nextGameStart: number
}

// A player intends to make a move.
interface MoveMessage {
    // The position the player wants to place their mark in.
    position: Val;
}

// Payload for an RPC request to find a match.
interface RpcFindMatchRequest {
    // User can choose a fast or normal speed match.
    fast: boolean
}

// Payload for an RPC response containing match IDs the user can join.
interface RpcFindMatchResponse {
    // One or more matches that fit the user's request.
    matchIds: string[]
}
