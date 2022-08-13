import Typography from '@mui/material/Typography';

export default function PCard (props) {
    return (
        <>
            
            <Typography variant="body1" display="inline">{props.curVal} {props.suit}</Typography>
            <Typography variant="body2" display="inline">({props.originalVal})</Typography>
            <Typography variant="body1" display="inline">{props.ability}</Typography>
        </>
    )
}