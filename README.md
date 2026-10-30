How to test:
After install - open a terminal window and run: node server.js
Open your web browser to: http://localhost:3000/

How to run:
Install pm2
Install pm2-windows-startup
cd to your install folder
pm2 start server.js --name HostSpecTool
pm2 save
pm2 start all
Open your web browser to: http://yourServerName:3000/

