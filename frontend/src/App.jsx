import './App.css'
import { config } from './lib/env.js'
import { ConfigError } from './components/States.jsx'
import Router from './router.jsx'

export default function App() {
  return config.errors.length ? <ConfigError names={config.errors} /> : <Router />
}
