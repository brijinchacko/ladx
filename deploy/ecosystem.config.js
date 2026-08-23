// PM2 process definition for ladx.ai.
//
// This file is the copy of record; the one on the server is deployed from here.
// It declares only the LADX process. The box runs fifteen unrelated apps, each
// started from its own config, so deploys always name this process explicitly
// (`pm2 start deploy/ecosystem.config.js --only ladx-web`) and never use the
// broadcast forms like `pm2 restart all`.
module.exports = {
  apps: [
    {
      name: "ladx-web",
      cwd: "/var/www/ladx-ai/apps/web",
      script: "node_modules/next/dist/bin/next",
      // The package script pins -p 3000, which is taken on this host. Setting
      // the port here keeps that script usable for local development unchanged.
      args: "start -p 3020",
      instances: 1,
      exec_mode: "fork",
      env: { NODE_ENV: "production", PORT: "3020" },
      // The host runs close to its memory ceiling and is already into swap, so
      // a leak here should cost this process rather than its neighbours.
      max_memory_restart: "600M",
      error_file: "/var/log/ladx/error.log",
      out_file: "/var/log/ladx/out.log",
      time: true,
    },
  ],
};
