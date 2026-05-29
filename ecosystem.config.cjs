module.exports = {
  apps: [{
    name: 'aitrip',
    script: 'npm',
    args: 'start',
    cwd: '/opt/aitrip',
    env: {
      NODE_ENV: 'production',
      PORT: 3001
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3001
    }
  }]
}
