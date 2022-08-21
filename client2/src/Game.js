
import './App.css';
import { useState, useEffect } from "react";
import nakama from './nakama';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import LogViewer from './LogViewer';
window.dagame = {}

function Game() {
  const [lastMove, setLastMove] = useState("None")
  const [myId, setMyId] = useState("None")
  const [myNumber, setMyNumber] = useState("None")

  const [stateName, setStateName] = useState("None")
  const [result, setResult] = useState("None")
  const [hand,setHand] = useState("None")

  const [winners,setWinners] = useState("None")
  const [winnersObj,setWinnersObj] = useState({})
  const [order,setOrder] = useState(-1)
  const [winnerMessage,setWinnersMessage] = useState("None")

  
  const [strat,setStrats] = useState("None")
  const [regrets,setRegrets] = useState("None")
  const [winnerStat,setWinnerStat] = useState("None")
  const [winnerLog,setWinnerLog] = useState([])


  useEffect(() => {
    async function authenticate() {
      const user_id = await nakama.authenticate();    
      var winnerObj = {};  
      setMyId(user_id);
      console.log('use socket')
      nakama.socket.onmatchdata = (result) => {
        console.log(result)
        let res = new TextDecoder().decode(result.data);
        console.log(res)
        res = JSON.parse(res)


        switch (result.op_code) {
          case 1:
            let number = parseInt(res.number)
            let winners = JSON.stringify(res.winners);
            winnerObj = res.winners;
            let strat = res.strats[number].map(x=>x.toFixed(2).toString() +",  ");
            let regrets = res.regrets[number];
            let wstats = res.winnerStats[number].map(x=>x.toString()+",");
            window.dagame.strat = strat
            setWinners(winners);
            setStrats(strat);
            setRegrets(regrets);
            setWinnerStat(wstats);
            setWinnersObj(winnerObj);
            console.log(1)
            window.dagame.state = "Start"            
            setStateName("Start")

            let resval = "";
            
            for (let key of res.hand) {
              resval+=res["rules"][key]+"|"
            }
            setHand(resval);
            setMyNumber(number)
            break;
          case 2:
            console.log(2)
            setStateName("Update")

            break;
          case 3:
            console.log(3);
            window.dagame.state = "Done";
            setStateName("DONE");
            let wl1 = res.logs??{};
            setMyNumber("None")
            setWinnerLog(wl1);
            if (res.winnerId == user_id) {
              setResult("Win!")
            } else {
              setResult("Loss!")
            }

            let order = res.order;
            setOrder(order)
            let moves = res.moves;
            let movesKey = "("+ moves[0]+", " + moves[1]+")";
            let mv = winnerObj[movesKey].map((x,ind)=>
            {
              if (ind == order) {
                return <span> <strong>{x+","}</strong></span>
              }
              return <span> {x+","}</span>
            });

            setWinnersMessage(mv)

            break;
          case 4:
            console.log(4)
            setStateName("MOVE")
            break;
          case 5:
            console.log(5)
            setStateName("REJECTED")
            break;
          default:
            console.log(6)
            setStateName("ERROR")

        }
      }
    }
    authenticate();

  }
    , []);

  const findMatch = async function () {
    await nakama.findMatch();
  }

  const quitMatch = async function(){
    await nakama.leaveMatch();
  }

  const move = async function (val) {
    // switch (val) {
    //   case 1: setLastMove("Rock"); break;
    //   case 2: setLastMove("Paper"); break;
    //   case 3: setLastMove("Scissors"); break;
    //     deafult: setLastMove("None"); break;
    // }
    setLastMove(val);
    await nakama.makeMove(val)
  }

  return (
    <div className="App">      
      <p>
        Id:{myId}
      </p>
      Number:{myNumber}
      <p id="pState">
        State:{stateName}
      </p>
    
      <Stack direction="row">
        <Button id="btnConnect" variant="contained" onClick={findMatch}>Connect</Button>
        <Button id="btnOne" variant="contained" onClick={() => move(0)}>1</Button>
        <Button id="btnTwo" variant="contained" onClick={() => move(1)}>2</Button>
        <Button id="btnThree" variant="contained" onClick={() => move(2)}>3</Button>
      </Stack>
        <Button variant="contained" onClick={quitMatch}>Quit Match</Button>
      <p>
        {hand}
      </p>
      <p>{lastMove}</p>
      <Typography>
        WinnerStats: {winnerStat} <br/>
        Winners: {winners} <br/>
        Strats: {strat} <br/>
        Regrets: {regrets} <br/>
        Result: {winnerMessage} <br/>
        Order: {order} <br/>
      </Typography>
      
      
      
      <p>
        {result}
      </p>

      <LogViewer log={winnerLog}></LogViewer>

     
    </div>
  );
}

export default Game;
