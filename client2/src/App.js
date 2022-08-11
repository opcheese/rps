import logo from './logo.svg';
import './App.css';
import { useState, useEffect } from "react";
import nakama from './nakama';
import Button from '@mui/material/Button';


function App() {
  const [lastMove, setLastMove] = useState("None")
  const [myId, setMyId] = useState("None")
  const [stateName, setStateName] = useState("None")
  const [result, setResult] = useState("None")
  const [hand,setHand] = useState("None")



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
            console.log(1)
            setStateName("Start")
            break;
          case 2:
            console.log(2)
            setStateName("Update")

            break;
          case 3:
            console.log(3)
            setStateName("DONE")
            setHand(JSON.stringify(res.board))
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
        <p>
          State:{stateName}
        </p>
        <Button variant="contained" onClick={findMatch}>Connect</Button>
        <Button variant="contained" onClick={() => move(1)}>Rock</Button>
        <Button variant="contained" onClick={() => move(2)}>Paper</Button>
        <Button variant="contained" onClick={() => move(3)}>Scissors</Button>

        <p>
          {lastMove}
        </p>

        <p>
          {result}
        </p>

        <p>
          {hand}
        </p>

      </header>
    </div>
  );
}

export default App;
