import { PropsWithChildren } from 'react'
import { initStore } from './store'
import './app.css'

function App({ children }: PropsWithChildren) {
  initStore()
  return children
}

export default App
