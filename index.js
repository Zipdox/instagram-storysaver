const instagram = require('instagram-private-api');
const Bluebird = require('bluebird');
const inquirer = require('inquirer');
const fs = require('fs');
const schedule = require('node-schedule');
const requestPromise = require('request-promise');

const cmdArgs = process.argv.slice(2);
const igUser = cmdArgs[0];
const igPass = cmdArgs[1];

if(!fs.existsSync('download/')) fs.mkdir('download');

var refreshSchedule;
var ig;

(async () => {
  ig = new instagram.IgApiClient();
  ig.state.generateDevice(igUser);
  Bluebird.try(async () => {
    const auth = await ig.account.login(igUser, igPass);
    console.log(auth);
    console.log('\n');
  }).catch(instagram.IgCheckpointError, async () => {
    console.log(ig.state.checkpoint);
    await ig.challenge.auto(true);
    console.log(ig.state.checkpoint);
    const { code } = await inquirer.prompt([
      {
        type: 'input',
        name: 'code',
        message: 'Enter code',
      },
    ]);
    console.log(await ig.challenge.sendSecurityCode(code));
  }).catch(e => console.log('Could not resolve checkpoint:', e, e.stack)).then(async () => {
    refreshSchedule = schedule.scheduleJob('52 * * * *', async function(fireDate){
      console.log(`Refreshing Instagram, scheduled for ${fireDate}, at ${new Date()}`);
      const reelsTray = await ig.feed.reelsTray().request();
      const wholeReelsTray = reelsTray.tray;
      for(storyEntry of wholeReelsTray){
        for(var mediaId of storyEntry.media_ids){
          var mediaInfo = await ig.media.info(mediaId);
          if(mediaInfo.items == undefined) continue;
          if(mediaInfo.items[0] == undefined) continue;
          var finalMedia = mediaInfo.items[0];
            downloadStory(finalMedia);
        }
      }
    });

  });


})();

function downloadStory(media){
  var url;
  var filename;
  var extension;
  var username;

  switch(media.media_type){
    case 1:
      url = media.image_versions2.candidates[0].url;
      filename = media.id;
      extension = 'jpeg';
      username = media.user.username;
      break;
    case 2:
      url = media.video_versions[0].url;
      filename = media.id;
      extension = 'mp4';
      username = media.user.username;
      break;
    default:
      return;
  }

  fs.exists(`download/${username}/${filename}.${extension}`, (alreadyDownloaded) => {
    if(alreadyDownloaded) return;
    requestPromise.get({ 
      url, 
      encoding: null,
      headers: {
            'Accept-Encoding': 'gzip',
            'Connection': 'close',
            'X-FB-HTTP-Engine': 'Liger',
            'User-Agent': ig.state.appUserAgent,
      },
    }).then((mediaData) => {
        fs.exists(`download/${username}/`, (userFolderExists) => {
          if(!userFolderExists) fs.mkdirSync(`download/${username}/`);
          fs.writeFile(`download/${username}/${filename}.${extension}`, mediaData, (err) => {
            if (err) throw err;
            console.log(`Downloaded ${username}/${filename}.${extension}`);
          });
        });
    });
  });
}