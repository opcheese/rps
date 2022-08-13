
import './App.css';
import { useState, useEffect,React } from "react";
import nakama from './nakama';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';

import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import LogViewer from './LogViewer';
import { getValue } from '@mui/system';
const axios = require('axios');

function BattleTester() { 
  const [winnerLog,setWinnerLog] = useState([])
  const [hands, setHands] = useState("");



  const testBattle = async function (val) {   
    let {data} = await axios.get('http://localhost/GameEngineServer/battle?hands='+val);
    setWinnerLog(data.logs)

  }

  return (
    <div className="App">           
    
      <TextField value={hands} onChange={(e) => setHands(e.target.value)} />
      <Button onClick={() => testBattle(hands)}>Test battle</Button>
     

      <LogViewer log={winnerLog}></LogViewer>
      
        
        

     
    </div>
  );
}

export default BattleTester;
