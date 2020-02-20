![][header-image]

[![CircleCI](https://img.shields.io/circleci/build/github/sammarks/cloudformation-video-thumbnail/master)](https://circleci.com/gh/sammarks/cloudformation-video-thumbnail)
[![Coveralls](https://img.shields.io/coveralls/sammarks/cloudformation-video-thumbnail.svg)](https://coveralls.io/github/sammarks/cloudformation-video-thumbnail)
[![Dev Dependencies](https://david-dm.org/sammarks/cloudformation-video-thumbnail/dev-status.svg)](https://david-dm.org/sammarks/cloudformation-video-thumbnail?type=dev)
[![Donate](https://img.shields.io/badge/donate-paypal-blue.svg)](https://paypal.me/sammarks15)

`cloudformation-video-thumbnail` is an AWS SAM + CloudFormation template designed to ingest videos
from an input S3 bucket, generate thumbnails for them at predetermined points (or "marks") at the
original resolution of the video, upload them back to a destination S3 bucket, and send an SNS
notification with the details of the process.

This template is basically just [benjaminadk's wonderful tutorial,](https://dev.to/benjaminadk/how-do-i-create-thumbnails-when-i-upload-a-video-aws-lambda-7l4) packaged as a CloudFormation template
for easy installation! It also utilizes [serverlesspub's ffmpeg-aws-lambda-layer package](https://github.com/serverlesspub/ffmpeg-aws-lambda-layer) for easily packaging ffmpeg with the Lambda function.
I highly recommend you check out those packages if you're interested in how it works.

## Get Started

It's simple! Click this fancy button:

[![Launch Stack](https://s3.amazonaws.com/cloudformation-examples/cloudformation-launch-stack.png)](https://console.aws.amazon.com/cloudformation/home?region=us-east-1#/stacks/new?stackName=github-sheets-sync&templateURL=https://sammarks-cf-templates.s3.amazonaws.com/video-thumbnail/template.yaml)

Then give the stack a name, and configure it:

### Parameters

| Parameter | Required | Default Value | Description |
| --- | --- | --- | --- |
| InputBucketName | **Yes** | | The name of the bucket to use for video inputs. |
| Marks | No | `0.01,0.25,0.5,0.75,0.99` | A comma-separated list of the points at which to take thumbnail screenshots. |
| DebugLevel | No | `<empty string>` | The `DEBUG` environment variable for the Lambda. Set to `cloudformation-video-thumbnail` to enable debug messages. |

### Outputs

| Output | Description |
| --- | --- |
| InputBucket | The name of the bucket where videos should be uploaded. |
| InputBucketArn | The ARN for the bucket where videos should be uploaded. |
| ThumbnailBucket | The name of the bucket where thumbnails are stored. |
| ThumbnailBucketArn | The ARN for the bucket where thumbnails are stored. |
| Topic | The ARN for the SNS Topic to subscribe to for pipeline notifications. |
| S3Topic | The ARN for the SNS Topic to subscribe to for object creation notifications from the input bucket. |

### Usage in Another Stack or Serverless

Add something like this underneath resources:

```yaml
videoThumbnailStack:
  Type: AWS::CloudFormation::Stack
  Properties:
    TemplateURL: https://sammarks-cf-templates.s3.amazonaws.com/video-thumbnail/VERSION/template.yaml
    Parameters:
      InputBucketName: test-input-bucket
      Marks: '0.01,0.25,0.5,0.75,0.99'
      DebugLevel: ''
```

**Note:** This stack will require the `CAPABILITY_AUTO_EXPAND` capability when deploying
the parent stack with CloudFormation. If you are using the Serverless framework, you can
"trick" it into adding the required capabilities by adding this to your `serverless.yaml`:

```yaml
resources:
  Transform: 'AWS::Serverless-2016-10-31' # Trigger Serverless to add CAPABILITY_AUTO_EXPAND
  Resources:
    otherResource: # ... all of your original resources
```

### Regions

**A quick note on regions:** If you are deploying this stack in a region other than `us-east-1`,
you need to reference the proper region S3 bucket as we're deploying Lambda functions. Just
add the region suffix to the template URL, so this:

```
https://sammarks-cf-templates.s3.amazonaws.com/video-thumbnail/VERSION/template.yaml
```

becomes this:

```
https://sammarks-cf-templates-us-east-2.s3.amazonaws.com/video-thumbnail/VERSION/template.yaml
```

### Subscribing to object creation events

S3 does not allow two separate Lambda functions to be subscribed to the same
event types on a single bucket. Because of this, the template creates an SNS
topic to serve as the messenger for the S3 notifications, and the internal
Lambda function subscribes to that SNS topic.

Because of this, if you want to subscribe to the object creation events in your
own Lambda functions, simply create a Lambda function that references the
`S3Topic` output of this stack.

### What's deployed?

- Two S3 buckets: one for video input, one for video output.
- A SNS topic for notifications.
- A SNS topic for object created notifications for the input bucket.
- A Lambda function to process the videos.

### How does it work?

The Lambda goes through the following process:

- Verify the video will work and get its length using ffprobe.
- Get a signed URL for the video using S3.
- Pass that signed URL to ffmpeg to get the thumbnails.
- Upload the thumbnails to S3.
- Send notifications to SNS along the way to indicate progress or errors.

### Accessing Previous Versions & Upgrading

Each time a release is made in this repository, the corresponding template is available at:

```
https://sammarks-cf-templates.s3.amazonaws.com/video-thumbnail/VERSION/template.yaml
```

**On upgrading:** I actually _recommend_ you lock the template you use to a specific version. Then, if you want to update to a new version, all you have to change in your CloudFormation template is the version and AWS will automatically delete the old stack and re-create the new one for you.

## Features

- Automatically generate thumbnails at predefined offsets for any video files uploaded to a S3 bucket.
- Reports the duration of videos to SNS as well whenever it is found.
- Send notifications about updates and error messages to a SNS topic.
- Deploy with other CloudFormation-compatible frameworks (like the Serverless framework).
- All functionality is self-contained within one CloudFormation template. Delete the template, and all of our created resources are removed.

## Why use this?

If you need to generate thumbnails from videos uploaded to your service, why write your own
implementation (which takes time), or pay for AWS' ElementalMedia services (which cost money),
when you can fire-and-forget an inexpensive CloudFormation template!

In my research, I had found plenty of examples for generating video thumbnails in the form of
tutorials, but I hadn't found where someone had packed it up as a CloudFormation template.

[header-image]: https://raw.githubusercontent.com/sammarks/art/master/cloudformation-video-thumbnail/header.jpg
