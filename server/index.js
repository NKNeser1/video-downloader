const express = require('express');
const cors = require('cors');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Video Downloader API is running',
  });
});

app.post('/api/analyze', (req, res) => {
  const { url } = req.body;

  if (!url || !url.trim()) {
    return res.status(400).json({
      success: false,
      message: 'Video URL is required',
    });
  }

  const videoUrl = url.trim();

  execFile(
    'yt-dlp',
    [
      '--dump-single-json',
      '--no-playlist',
      '--skip-download',
      videoUrl,
    ],
    {
      timeout: 60000,
    },
    (error, stdout, stderr) => {
      if (error) {
        console.error(
          'yt-dlp error:',
          stderr || error.message
        );

        return res.status(400).json({
          success: false,
          message:
            'Unable to analyze this video. Please check the URL and try again.',
        });
      }

      try {
        const data = JSON.parse(stdout);

        const formats = (data.formats || [])
          .filter((format) => {
            return (
              format.url &&
              format.height &&
              format.vcodec &&
              format.vcodec !== 'none'
            );
          })
          .map((format) => ({
            formatId: format.format_id,
            quality: `${format.height}p`,
            extension: format.ext || 'mp4',
            filesize: format.filesize || null,
          }))
          .filter(
            (format, index, array) =>
              index ===
              array.findIndex(
                (item) =>
                  item.quality === format.quality &&
                  item.extension === format.extension
              )
          )
          .sort((a, b) => {
            const heightA =
              parseInt(a.quality) || 0;
            const heightB =
              parseInt(b.quality) || 0;

            return heightB - heightA;
          });

        res.json({
          success: true,
          platform:
            data.extractor_key ||
            data.extractor ||
            'Unknown',
          title:
            data.title ||
            'Untitled Video',
          thumbnail:
            data.thumbnail ||
            null,
          duration:
            data.duration ||
            null,
          uploader:
            data.uploader ||
            null,
          webpageUrl:
            data.webpage_url ||
            videoUrl,
          formats,
        });
      } catch (parseError) {
        console.error(
          'JSON parsing error:',
          parseError
        );

        return res.status(500).json({
          success: false,
          message:
            'Unable to process video information.',
        });
      }
    }
  );
});

app.post('/api/download', (req, res) => {
  const { url, formatId } = req.body;

  if (!url || !url.trim()) {
    return res.status(400).json({
      success: false,
      message: 'Video URL is required',
    });
  }

  const videoUrl = url.trim();
  const format = formatId?.trim() || 'best';

  const downloadDir = path.join(__dirname, 'downloads');

  if (!fs.existsSync(downloadDir)) {
    fs.mkdirSync(downloadDir, { recursive: true });
  }

  const outputFile = path.join(
    downloadDir,
    `video-${Date.now()}.mp4`
  );

  console.log(`Download requested: ${videoUrl}`);

  const downloadProcess = execFile(
    'yt-dlp',
    [
      '--no-playlist',
      '-f',
      `${format}+bestaudio/${format}/best`,
      '--merge-output-format',
      'mp4',
      '-o',
      outputFile,
      videoUrl,
    ],
    {
      timeout: 300000,
    },
    (error, stdout, stderr) => {
      if (error) {
        console.error(
          'Download error:',
          stderr || error.message
        );

        if (!res.headersSent) {
          return res.status(400).json({
            success: false,
            message:
              'Unable to download this video. The video may require login or may not be accessible.',
          });
        }

        return;
      }

      if (!fs.existsSync(outputFile)) {
        return res.status(500).json({
          success: false,
          message:
            'Download finished but the video file was not created.',
        });
      }

      const stats = fs.statSync(outputFile);

      if (stats.size === 0) {
        fs.unlinkSync(outputFile);

        return res.status(500).json({
          success: false,
          message:
            'Downloaded video file is empty.',
        });
      }

      console.log(
        `Download completed: ${stats.size} bytes`
      );

      res.download(
        outputFile,
        'video.mp4',
        (downloadError) => {
          fs.unlink(
            outputFile,
            () => {}
          );

          if (downloadError) {
            console.error(
              'File sending error:',
              downloadError.message
            );
          }
        }
      );
    }
  );

    res.on('close', () => {
    if (!res.writableEnded && !downloadProcess.killed) {
      downloadProcess.kill();
    }
  });
  });

app.listen(PORT, '0.0.0.0', () => {
  console.log(
    `Server running on http://localhost:${PORT}`
  );
});