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
    },
    {
      name: 'AccountingService',
      script: 'server.js',
      cwd: './AccountingService',
      watch: true,
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'MktService',
      script: 'server.js',
      cwd: './MktService',
      watch: true,
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'MktService-Cron',
      script: 'jobMktDataUpdate.js',
      cwd: './MktService',
      watch: true,
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'Portfolio-Aggr',
      script: 'jobAggrPortfolio.js',
      cwd: './AccountingService',
      watch: true,
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};
