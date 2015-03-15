var kue = require('kue'),
    express = require('express'),
    nconf = require('nconf');

nconf
  .argv()
  .env()
  .file({ file: __dirname + '/config.json' });

var app = express();

var kueRedisOpts = {
  port: nconf.get('REDIS_PORT'),
  host: nconf.get('REDIS_HOST')
};

if(nconf.get('NODE_ENV') === 'production'){
  var rawConnection = nconf.get('REDISCLOUD_URL').slice(19);
  var split = rawConnection.split('@');
  kueRedisOpts.auth = split[0];
  split = split[1].split(':');
  kueRedisOpts.host = split[0];
  kueRedisOpts.port = split[1];
}

var queue = kue.createQueue({
  disableSearch: true,
  redis: kueRedisOpts
});

queue.process('email', 3, require('./workers/email'));
queue.process('sendBatchEmails', require('./workers/sendBatchEmails'));

queue.promote();

queue.on('job complete', function(id, result){
  kue.Job.get(id, function(err, job){
    if(err) return;
    job.remove(function(err){
      if(err) throw err;
    });
  });
});

queue.on('job failed', function(){
  var args = Array.prototype.slice.call(arguments);
  args.unshift('Error processing job.');
  console.error.apply(console, args);
});

process.once('SIGTERM', function(sig){
  queue.shutdown(function(err) {
    console.log('Kue is shutting down.', err || '');
    process.exit(0);
  }, 9500);
});

app.use(require('basic-auth-connect')(nconf.get('AUTH_USER'), nconf.get('AUTH_PASSWORD')));
app.use(kue.app);
app.listen(nconf.get('PORT'));
console.log('Server listening on port ' + nconf.get('PORT'));