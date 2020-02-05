const AWS = require('aws-sdk')
const path = require('path')
const os = require('os')
const fs = require('fs')
const uuid = require('uuid/v4')
const { spawnSync } = require('child_process')
const debug = require('debug')('cloudformation-video-thumbnail')

const FFMPEG_PATH = '/opt/bin/ffmpeg'
const FFPROBE_PATH = '/opt/bin/ffprobe'
const ALLOWED_TYPES = ['mov', 'mpg', 'mpeg', 'mp4', 'wmv', 'avi', 'webm']
const MARKS = process.env.MARKS.split(',').map((mark, index) => [parseFloat(mark), index.toString()])
const s3 = new AWS.S3()
const sns = new AWS.SNS()
const thumbnailBucket = process.env.THUMBNAIL_BUCKET
const snsTopic = process.env.SNS_TOPIC

const STATUSES = {
  PROCESSING: 'PROCESSING',
  ERROR: 'ERROR',
  COMPLETE: 'COMPLETE'
}

const reportStatusUpdate = async (bucket, key, status, detail) => {
  const payload = { bucket, key, status, detail }
  debug('reporting status update %O', payload)
  await sns.publish({
    Message: JSON.stringify(payload),
    TopicArn: snsTopic
  }).promise()
  debug('reported')
}

const createImage = (seek, target, tmpFileName) => {
  debug('creating image at seek %d for %s', seek, target)
  const ffmpeg = spawnSync(FFMPEG_PATH, [
    '-ss',
    seek,
    '-i',
    target,
    '-vf',
    'thumbnail',
    '-qscale:v',
    '2',
    '-frames:v',
    '1',
    '-f',
    'image2',
    '-c:v',
    'mjpeg',
    tmpFileName
  ])
  if (ffmpeg.stdout) {
    debug(ffmpeg.stdout.toString())
  }
  if (ffmpeg.stderr) {
    debug(ffmpeg.stderr.toString())
  }
  debug('exit code %s', ffmpeg.status.toString())
  if (ffmpeg.status !== 0) {
    debug('error creating image at seek %d for %s', seek, target)
    debug(ffmpeg.stderr.toString())
    throw new Error(`Error creating image: status ${ffmpeg.status.toString()}, stderr ${ffmpeg.stderr.toString()}`)
  }
}

const uploadToS3 = (srcKey, tmpFileName, resultName) => new Promise((resolve, reject) => {
  const tmpFile = fs.createReadStream(tmpFileName)
  const dstKey = `${srcKey}.${resultName}.jpg`
  debug('uploading %s to s3 as %s', tmpFileName, dstKey)
  s3.upload({
    Bucket: thumbnailBucket,
    Key: dstKey,
    Body: tmpFile,
    ContentType: 'image/jpg'
  }, (err, data) => {
    if (err) {
      debug('error uploading %s', dstKey)
      debug(err)
      return reject(err)
    }
    debug('uploaded %s successfully', dstKey)
    resolve(dstKey)
  })
})

const processImage = async (key, target, seek, resultName) => {
  debug('processing image %s at seek %d and resultName %s', key, seek, resultName)
  const tmpFileName = path.resolve(os.tmpdir(), `${uuid()}.jpg`)
  debug('tmpFileName for seek %d is %s. creating image...', seek, tmpFileName)
  await createImage(seek, target, tmpFileName)
  debug('image created. uploading seek %d to S3', seek)
  return uploadToS3(key, tmpFileName, resultName)
}

module.exports.handler = async (event) => {
  debug('incoming S3 message', event.Records[0].Sns.Message)
  const message = JSON.parse(event.Records[0].Sns.Message)
  debug('decoded message', message)
  const srcKey = decodeURIComponent(message.Records[0].s3.object.key).replace(/\+/g, ' ')
  const bucket = message.Records[0].s3.bucket.name

  await reportStatusUpdate(bucket, srcKey, STATUSES.PROCESSING)

  const target = s3.getSignedUrl('getObject', { Bucket: bucket, Key: srcKey, Expires: 60000 })
  let fileType = srcKey.match(/\.\w+$/)

  if (!fileType) {
    const message = `Invalid file type found for key: ${srcKey}`
    await reportStatusUpdate(bucket, srcKey, STATUSES.ERROR, message)
    throw new Error(message)
  }
  fileType = fileType[0].slice(1)

  if (ALLOWED_TYPES.indexOf(fileType) === -1) {
    const message = `Filetype: ${fileType} is not an allowed type`
    await reportStatusUpdate(bucket, srcKey, STATUSES.ERROR, message)
    throw new Error(message)
  }

  try {
    debug('probing with ffprobe')
    const ffprobe = spawnSync(FFPROBE_PATH, [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=nw=1:nk=1',
      target
    ])
    debug('ffprobe result %O', ffprobe)
    const duration = Math.ceil(ffprobe.stdout.toString())

    const results = []
    for (const mark of MARKS) {
      results.push(await processImage(srcKey, target, duration * mark[0], mark[1]))
    }
    await reportStatusUpdate(bucket, srcKey, STATUSES.COMPLETE, results)
  } catch (err) {
    debug('error found during processing')
    debug(err)
    await reportStatusUpdate(bucket, srcKey, STATUSES.ERROR, err.stack)
  }
}
