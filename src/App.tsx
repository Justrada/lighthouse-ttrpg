import { Routes, Route, Navigate } from 'react-router-dom';
import HomeScreen from './screens/HomeScreen';
import RosterScreen from './screens/RosterScreen';
import ForgeScreen from './screens/ForgeScreen';
import HostScreen from './screens/HostScreen';
import JoinScreen from './screens/JoinScreen';
import TableScreen from './screens/TableScreen';
import WorldforgeScreen from './screens/WorldforgeScreen';
import MarketplaceScreen from './screens/MarketplaceScreen';
import { AppOverlays } from './components/system/AppOverlays';
import { ErrorBoundary } from './components/system/ErrorBoundary';

export default function App() {
  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/" element={<HomeScreen />} />
        <Route path="/roster" element={<RosterScreen />} />
        <Route path="/forge" element={<ForgeScreen />} />
        <Route path="/forge/:id" element={<ForgeScreen />} />
        <Route path="/host" element={<HostScreen />} />
        <Route path="/join" element={<JoinScreen />} />
        <Route path="/table" element={<TableScreen />} />
        <Route path="/worldforge" element={<WorldforgeScreen />} />
        <Route path="/marketplace" element={<MarketplaceScreen />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <AppOverlays />
    </ErrorBoundary>
  );
}
