import { Routes, Route, Navigate } from 'react-router-dom'
import AdminLayout from './components/layout/AdminLayout'
import Dashboard from './pages/Dashboard'
import Cities from './pages/Cities'
import POIBrowser from './pages/POIBrowser'
import POIDetail from './pages/POIDetail'
import Updates from './pages/Updates'
import PendingUpdates from './pages/PendingUpdates'
import ReviewQueue from './pages/ReviewQueue'

export default function App() {
  return (
    <Routes>
      <Route element={<AdminLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="cities" element={<Cities />} />
        <Route path="pois" element={<POIBrowser />} />
        <Route path="pois/:id" element={<POIDetail />} />
        <Route path="updates" element={<Updates />} />
        <Route path="pending" element={<PendingUpdates />} />
        <Route path="review" element={<ReviewQueue />} />
        <Route path="*" element={<Navigate to="" replace />} />
      </Route>
    </Routes>
  )
}
