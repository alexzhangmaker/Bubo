module.exports = {
  apps: [
    {
      name: 'BuboAgent',
      script: 'index.js',
      cwd: './BuboAgent',
      watch: true,
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'BuboAIProxy',
      script: 'server.js',
      cwd: './BuboAIProxy',
      watch: true,
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'BuboBots',
      script: 'server.js',
      cwd: './BuboBots',
      watch: true,
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'BuboDocMgr',
      script: 'server.js',
      cwd: './BuboDocMgr',
      watch: true,
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'BuboMemoMgr',
      script: 'index.js',
      cwd: './BuboMemoMgr',
      watch: true,
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};
