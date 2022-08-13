import Logline from "./LogLine";

function parseLog(log) {
    let res = [];
    let allRes = {}
    let ld = "";
    let rd = ";"
    if (log.length>0) {
        ld = log[0].events[0].left_deck;
        rd = log[0].events[0].right_deck;
    }
    allRes = {ld,rd};
    for (let logPhaze of log) {
        for (let eventItem of logPhaze.events) {
            if (eventItem.post_state_str) {
                let logObj = {}
                let board = [];
                let strCards = eventItem.post_state_str.split("|||");
                for (let strCard of strCards){
                    let pcard = {empty:true, curVal:0,originalVal:0,suit:"",ability:""}
                    if (strCard.toLowerCase().trim()!="empty"){
                        let cardAttrs = strCard.split("|");
                        for (let cardAttr of cardAttrs) {
                            let namval = cardAttr.trim().split(" ");
                            pcard[namval[0].trim()] = namval[1].trim();
                        }
                        let suit = pcard.suit=="0"?"♠":"♦"
                        pcard = {empty:false, curVal:parseInt(pcard.current),originalVal:parseInt(pcard.intial),suit:suit,ability:pcard.ability}
                    }
                    board.push(pcard)
                }
                logObj = {
                    eventName: eventItem.evet_name,
                    board:board,
                    sideNum: eventItem.side_num,
                    postStateStr: eventItem.post_state_str,

                }
                res.push(logObj);
            }
        }

    }
    allRes.log = res;
    return allRes;
}

export default function LogViewer(props) {
    let {ld,rd,log} = parseLog(props.log);
    const lines = log.map((x,ind)=><Logline key={ind} {...x}></Logline>);
    return (
        <div>
            {ld}<br/>
            {rd}<br/>
            {lines}
        </div>
    )
}