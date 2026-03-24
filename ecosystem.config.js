module.exports = {
  apps: [
    {
      name: 'BuboAgent',
      script: 'index.js',
      cwd: './BuboAgent',
      watch: true,
      ignore_watch: ['logs', 'node_modules', '*.db', '*.sqlite'],
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'BuboAIProxy',
      script: 'server.js',
      cwd: './BuboAIProxy',
      watch: true,
      ignore_watch: ['logs', 'node_modules', '*.db', '*.sqlite'],
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'BuboBots',
      script: 'server.js',
      cwd: './BuboBots',
      watch: true,
      ignore_watch: ['logs', 'node_modules', '*.db', '*.sqlite'],
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'BuboDocMgr',
      script: 'server.js',
      cwd: './BuboDocMgr',
      watch: true,
      ignore_watch: ['logs', 'node_modules', 'uploads', '*.db', '*.sqlite'],
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'BuboMemoMgr',
      script: 'index.js',
      cwd: './BuboMemoMgr',
      watch: true,
      ignore_watch: ['logs', 'node_modules', 'cache', '*.db', '*.sqlite'],
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'AccountingService',
      script: 'server.js',
      cwd: './AccountingService',
      watch: true,
      ignore_watch: ['logs', 'node_modules', '*.sqlite', '*.db'],
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'MktService',
      script: 'server.js',
      cwd: './MktService',
      watch: true,
      ignore_watch: ['logs', 'node_modules', '*.sqlite', '*.db'],
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'MktService-Cron',
      script: 'jobMktDataUpdate.js',
      cwd: './MktService',
      watch: true,
      ignore_watch: ['logs', 'node_modules', '*.sqlite', '*.db'],
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'Portfolio-Aggr',
      script: 'jobAggrPortfolio.js',
      cwd: './AccountingService',
      watch: true,
      ignore_watch: ['logs', 'node_modules', '*.sqlite', '*.db'],
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'analytics_service',
      script: 'analytics_service.py',
      cwd: './pyAnalytics',
      interpreter: '/Users/zhangqing/Documents/GitHub/Bubo/pyAnalytics/venv/bin/python3',
      watch: true,
      ignore_watch: ['logs', 'node_modules', '*.sqlite', '*.db'],
      env: {
        PYTHONPATH: '.'
      }
    }
  ]
};
