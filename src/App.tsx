import { AppProvider, useApp } from '@/context/AppContext'
import { AuthProvider } from '@/context/AuthContext'
import AuthModal from '@/components/AuthModal'
import HomePage from '@/pages/HomePage'
import CreateTripPage from '@/pages/CreateTripPage'
import HotelStepPage from '@/pages/HotelStepPage'
import HotelDetailPage from '@/pages/HotelDetailPage'
import PlaceSelectionPage from '@/pages/PlaceSelectionPage'
import PlannerPage from '@/pages/PlannerPage'
import OverviewPage from '@/pages/OverviewPage'
import AttractionDetailPage from '@/pages/AttractionDetailPage'
import ProfilePage from '@/pages/ProfilePage'
import TravelNotesPage from '@/pages/TravelNotesPage'
import NoteDetailPage from '@/pages/NoteDetailPage'
import JournalPage from '@/pages/JournalPage'

function AppContent() {
  const { state } = useApp()

  switch (state.currentView) {
    case 'home':
      return <HomePage />
    case 'create':
      return <CreateTripPage />
    case 'hotel-step':
      return <HotelStepPage />
    case 'hotel-detail':
      return <HotelDetailPage />
    case 'place-selection':
      return <PlaceSelectionPage />
    case 'planner':
      return <PlannerPage />
    case 'overview':
      return <OverviewPage />
    case 'detail':
      return <AttractionDetailPage />
    case 'profile':
      return <ProfilePage />
    case 'travel-notes':
      return <TravelNotesPage />
    case 'note-detail':
      return <NoteDetailPage />
    case 'journal':
      return <JournalPage />
    default:
      return <HomePage />
  }
}

function App() {
  return (
    <AuthProvider>
      <AppProvider>
        <AppContent />
        <AuthModal />
      </AppProvider>
    </AuthProvider>
  )
}

export default App
