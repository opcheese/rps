import Typography from '@mui/material/Typography';
import PCard from './PCard';
export default function TwoHand (props) {
    let lh = props.board[0];
    let rh = props.board[1];

    return (
        <>
            
            { !lh.empty
              ?<PCard {...lh}></PCard>
              : "EMPTU"
            }
             /-\
             { !rh.empty
                ? <PCard {...rh}></PCard>
                : "EMPTY"
             }

        </>
    )
}