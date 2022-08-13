import React from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  
} from "react-router-dom";

import Game from "./Game";
import BattleTester from "./BattleTester"

export default function App() {
    return (
        <Router>
        
          <Routes>
            <Route exact path="/" element={<Game/>}/>
            <Route exact path="/battle" element={<BattleTester/>}/>            
          </Routes>
        
      </Router>
    );
  }