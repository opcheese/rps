import { Client } from "@heroiclabs/nakama-js";
import { v4 as uuidv4 } from "uuid";

class Nakama {
    constructor() {
        // this.client
        // this.session
        // this.socket // ep4
        // this.matchID // ep4
    }

    async authenticate() {
        this.client = new Client("defaultkey", "localhost", "7350");
        this.client.ssl = false;

        let deviceId = localStorage.getItem("deviceId");
        if (!deviceId) {
            deviceId = uuidv4();
            localStorage.setItem("deviceId", deviceId);
        }

        this.session = await this.client.authenticateDevice(deviceId, true);
        localStorage.setItem("user_id", this.session.user_id);

        // ep4
        const trace = false;
        this.socket = this.client.createSocket(this.useSSL, trace);
        console.log("set socket")
        await this.socket.connect(this.session);
        return this.session.user_id;

    }

    async findMatch() { // ep4
        const rpcid = "find_match_js";
        const matches = await this.client.rpc(this.session, rpcid, {fast:0});

        this.matchID = matches.payload.matchIds[0]
        await this.socket.joinMatch(this.matchID);
        console.log("Matched joined!")
    }

    async makeMove(index) { // ep4
        var data = { "position": index };
        console.log(data);
        await this.socket.sendMatchState(this.matchID, 4, JSON.stringify(data));
        console.log("Match data sent")
    }
}

export default new Nakama()