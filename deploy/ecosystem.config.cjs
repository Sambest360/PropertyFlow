module.exports = {
  apps: [{
    name: 'propertyflow-api',
    cwd: '/var/www/propertyflow',
    script: 'node_modules/.bin/tsx',
    args: '--env-file=.env server/index.ts',
    max_memory_restart: '500M',
    autorestart: true,
    env: { NODE_ENV: 'production' },
  }],
}
