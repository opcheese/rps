import Typography from '@mui/material/Typography';
import Card from "@mui/material/Card";
import TwoHand from "./TwoHand"
export default function Logline (props) {
    return (
        <Card>
            <Typography variant="caption" display="inline">({props.eventName} {props.sideNum})  </Typography>
            <TwoHand board={props.board}/>
        </Card>
    )
}