import logo from './logo.svg';
import './App.css';
import { useState, useEffect } from "react";
import nakama from './nakama';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';


function App() {
  const [lastMove, setLastMove] = useState("None")
  const [myId, setMyId] = useState("None")
  const [myNumber, setMyNumber] = useState("None")

  const [stateName, setStateName] = useState("None")
  const [result, setResult] = useState("None")
  const [hand,setHand] = useState("None")

  const [winners,setWinners] = useState("None")
  const [strat,setStrats] = useState("None")
  const [regrets,setRegrets] = useState("None")
  const [winnerStat,setWinnerStat] = useState("None")
  const [winnerLog,setWinnerLog] = useState("None")






  useEffect(() => {
    async function authenticate() {
      const user_id = await nakama.authenticate();      
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
            let winners = res.winners;
            let strat = res.strats[number];
            let regrets = res.regrets[number];
            let wstats = res.winnerStats[number];
    
            setWinners(winners);
            setStrats(strat);
            setRegrets(regrets);
            setWinnerStat(wstats)
            console.log(1)
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
            console.log(3)
            setStateName("DONE")
            let wl1 = res.logs;
            setWinnerLog(JSON.stringify(wl1));
            if (res.winnerId == user_id) {
              setResult("Win!")
            } else {
              setResult("Loss!")
            }
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

  const move = async function (val) {
    switch (val) {
      case 1: setLastMove("Rock"); break;
      case 2: setLastMove("Paper"); break;
      case 3: setLastMove("Scissors"); break;
        deafult: setLastMove("None"); break;
    }
    await nakama.makeMove(val)
  }

  return (
    <div className="App">
      <header className="App-header">
        <p>
          Id:{myId}
        </p>
        Number:{myNumber}
        <p>
          State:{stateName}
        </p>
        <Stack direction="row">
          <Button variant="contained" onClick={findMatch}>Connect</Button>
          <Button variant="contained" onClick={() => move(1)}>1</Button>
          <Button variant="contained" onClick={() => move(2)}>2</Button>
          <Button variant="contained" onClick={() => move(3)}>3</Button>
        </Stack>
        <p>
          {hand}
        </p>
        <Typography>
          WinnerStats: {winnerStat} <br/>
          Winners: {winners} <br/>
          Strats: {strat} <br/>
          Regrets: {regrets} <br/>
        </Typography>
        
        
        
        <p>
          {result}
        </p>
        <Typography>
          WinnerLog: {winnerLog} <br/>
        </Typography>
        

      </header>
    </div>
  );
}

export default App;
