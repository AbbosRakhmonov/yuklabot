module.exports = {
  apps: [{
    name: "yuklabot",
    script: "./dist/index.js",
    instances: 1,
    exec_mode: "cluster",
    cwd: "/mnt/storage/projects/yuklabot",
    env: {
      NODE_ENV: "production",
      PORT: 5000
    },
    error_file: "~/logs/yuklabot_error.log",
    out_file: "~/logs/yuklabot_out.log",
    log_date_format: "YYYY-MM-DD HH:mm:ss Z"
  }]
}
