/*

*/

const https = require('https');

function post(gateway, endpoint, data) {
  data = JSON.stringify(data);

  //console.log(data);

  let options = {
    hostname: gateway,
    port: 443,
    path: endpoint,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': data.length
    }
  }

  return new Promise((resolve, reject) => {
    const req = https.request(options, res => {
      let buffers = [];

      res.on('data', d => {
        buffers.push(d);
      });

      res.on('end', () => {
        //console.log(Buffer.concat(buffers).toString())
        resolve(JSON.parse(Buffer.concat(buffers).toString()));
      });
    });

    req.on('error', error => {
      console.error(error)
    });

    req.write(data);
    req.end();
  });
}

module.exports = { post };
