import { Routes, Route, Navigate } from 'react-router-dom';
import HomeScreen from './screens/HomeScreen';
import RosterScreen from './screens/RosterScreen';
import ForgeScreen from './screens/ForgeScreen';
import HostScreen from './screens/HostScreen';
import JoinScreen from './screens/JoinScreen';
import TableScreen from './screens/TableScreen';
import { AppOverlays } from './components/system/AppOverlays';

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<HomeScreen />} />
        <Route path="/roster" element={<RosterScreen />} />
        <Route path="/forge" element={<ForgeScreen />} />
        <Route path="/forge/:id" element={<ForgeScreen />} />
        <Route path="/host" element={<HostScreen />} />
        <Route path="/join" element={<JoinScreen />} />
        <Route path="/table" element={<TableScreen />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <AppOverlays />
    </>
  );
}
