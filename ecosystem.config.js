module.exports = {
  apps: [
    {
      name: 'beforeafterify',
      script: 'dist/server.js',
      cwd: '/Users/jim/Sites/beforeafterify',
      env: {
        PORT: 3003,
        NODE_ENV: 'production',
      },
      restart_delay: 3000,
      max_restarts: 10,
    },
  ],
};
