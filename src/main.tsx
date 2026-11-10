import {createRoot} from 'react-dom/client';
import Controller from './ui/controller';
import Screen from './ui/screen';
import Accept from './ui/accept';
import './globals.css';
const query=new URLSearchParams(location.search),view=query.get('view');
createRoot(document.getElementById('root')!).render(view==='accept'?<Accept/>:view==='screen'?<Screen id={query.get('board')||''}/>:<Controller/>);
