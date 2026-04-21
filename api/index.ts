import { initDB } from '../server/db.js'
import app from '../server/index.js'

// Initialize database on cold start
initDB()

export default app
