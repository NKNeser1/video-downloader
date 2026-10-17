import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import {
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ScrollView,
  Image,
  ActivityIndicator,
  Platform,
} from 'react-native';

type VideoFormat = {
  formatId: string;
  quality: string;
  extension: string;
  filesize: number | null;
  url: string;
};

type VideoInfo = {
  platform: string;
  title: string;
  thumbnail: string | null;
  duration: number | null;
  uploader: string | null;
  webpageUrl: string;
  formats: VideoFormat[];
};

export default function App() {
  const [url, setUrl] = useState('');
  const [message, setMessage] = useState('');
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [selectedFormatId, setSelectedFormatId] = useState<string | null>(null);

  const analyzeVideo = async () => {
    if (!url.trim()) {
      setMessage('⚠️ Please paste a video URL first.');
      setVideoInfo(null);
      return;
    }

    setMessage('');
    setVideoInfo(null);
    setSelectedFormatId(null);
    setLoading(true);

    try {
      const response = await fetch(
        `${process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000'}/api/analyze`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            url: url.trim(),
          }),
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        setMessage(
          `❌ ${
            data.message ||
            'Unable to analyze this video.'
          }`
        );
        return;
      }

      setVideoInfo(data);
      setSelectedFormatId(data.formats?.[0]?.formatId ?? null);
      setMessage(
        `✅ ${data.platform} video found successfully`
      );
    } catch (error) {
      setMessage(
        '❌ Unable to connect to downloader server.'
      );
    } finally {
      setLoading(false);
    }
  };

  const downloadVideo = async () => {
    if (!videoInfo || !selectedFormatId) {
      setMessage('⚠️ Please select a video quality first.');
      return;
    }

    setDownloading(true);
    setMessage('⬇️ Preparing your video download...');

    try {
      const response = await fetch(
        `${process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000'}/api/download`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            url: url.trim(),
            formatId: selectedFormatId,
          }),
        }
      );

      if (!response.ok) {
        let errorMessage = `Download failed (HTTP ${response.status}).`;

        try {
          const errorData = await response.json();
          if (errorData.message) errorMessage = errorData.message;
        } catch {}

        throw new Error(errorMessage);
      }

      const blob = await response.blob();

      if (!blob.size) {
        throw new Error('The downloaded video file is empty.');
      }

      if (Platform.OS === 'web') {
        const objectUrl = URL.createObjectURL(blob);
        const anchor = document.createElement('a');

        anchor.href = objectUrl;
        anchor.download = 'video.mp4';
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();

        setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
        setMessage('✅ Video download started successfully.');
      } else {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();

          reader.onloadend = () => {
            if (typeof reader.result !== 'string') {
              reject(new Error('Unable to prepare the video file.'));
              return;
            }

            resolve(reader.result.split(',')[1] || '');
          };

          reader.onerror = () => {
            reject(new Error('Unable to read the downloaded video.'));
          };

          reader.readAsDataURL(blob);
        });

        const directory = FileSystem.cacheDirectory;

        if (!directory) {
          throw new Error('Video storage is unavailable.');
        }

        const fileUri = `${directory}video-${Date.now()}.mp4`;

        await FileSystem.writeAsStringAsync(fileUri, base64, {
          encoding: FileSystem.EncodingType.Base64,
        });

        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(fileUri, {
            mimeType: 'video/mp4',
            dialogTitle: 'Save or share video',
          });

          setMessage('✅ Video file is ready to save or share.');
        } else {
          setMessage('✅ Video saved in temporary app storage.');
        }
      }
    } catch (error) {
      setMessage(
        `❌ ${error instanceof Error ? error.message : 'Unable to download this video.'}`
      );
    } finally {
      setDownloading(false);
    }
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return 'Unknown';

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);

    return `${String(minutes).padStart(2, '0')}:${String(
      remainingSeconds
    ).padStart(2, '0')}`;
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return '';

    const mb = bytes / (1024 * 1024);

    return `${mb.toFixed(1)} MB`;
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.logoBox}>
            <Text style={styles.logoIcon}>↓</Text>
          </View>

          <View style={styles.headerText}>
            <Text style={styles.title}>
              Video Downloader
            </Text>

            <Text style={styles.subtitle}>
              Fast • Simple • Secure
            </Text>
          </View>
        </View>

        {/* Main Content */}
        <View style={styles.main}>
          <Text style={styles.welcome}>
            Download your favorite videos
          </Text>

          <Text style={styles.description}>
            Paste a video link below to get started
          </Text>

          {/* URL Input */}
          <View style={styles.inputBox}>
            <Text style={styles.linkIcon}>🔗</Text>

            <TextInput
              style={styles.input}
              placeholder="Paste video URL here..."
              placeholderTextColor="#8b8b96"
              autoCapitalize="none"
              autoCorrect={false}
              value={url}
              onChangeText={setUrl}
            />
          </View>

          {/* Analyze Button */}
          <TouchableOpacity
            style={[
              styles.analyzeButton,
              loading && styles.disabledButton,
            ]}
            onPress={analyzeVideo}
            activeOpacity={0.8}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator
                size="small"
                color="#ffffff"
              />
            ) : (
              <>
                <Text style={styles.analyzeText}>
                  Analyze Video
                </Text>

                <Text style={styles.arrow}>→</Text>
              </>
            )}
          </TouchableOpacity>

          {/* Message */}
          {message ? (
            <Text style={styles.message}>
              {message}
            </Text>
          ) : null}

          {/* Video Result */}
          {videoInfo ? (
            <View style={styles.resultCard}>
              <Text style={styles.resultTitle}>
                VIDEO DETECTED
              </Text>

              {/* Thumbnail */}
              {videoInfo.thumbnail ? (
                <Image
                  source={{
                    uri: videoInfo.thumbnail,
                  }}
                  style={styles.thumbnail}
                  resizeMode="cover"
                />
              ) : null}

              {/* Title */}
              <Text
                style={styles.videoTitle}
                numberOfLines={3}
              >
                {videoInfo.title}
              </Text>

              {/* Platform */}
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>
                  📱 Platform
                </Text>

                <Text style={styles.detailValue}>
                  {videoInfo.platform}
                </Text>
              </View>

              {/* Uploader */}
              {videoInfo.uploader ? (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>
                    👤 Uploader
                  </Text>

                  <Text
                    style={styles.detailValue}
                    numberOfLines={1}
                  >
                    {videoInfo.uploader}
                  </Text>
                </View>
              ) : null}

              {/* Duration */}
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>
                  ⏱️ Duration
                </Text>

                <Text style={styles.detailValue}>
                  {formatDuration(
                    videoInfo.duration
                  )}
                </Text>
              </View>

              {/* Quality */}
              <Text style={styles.qualityTitle}>
                Available Quality
              </Text>

              {videoInfo.formats.length > 0 ? (
                videoInfo.formats.map(
                  (format, index) => (
                    <TouchableOpacity
                      key={`${format.formatId}-${index}`}
                      style={[
                        styles.qualityButton,
                        selectedFormatId === format.formatId && styles.selectedQualityButton,
                      ]}
                      onPress={() => setSelectedFormatId(format.formatId)}
                      activeOpacity={0.8}
                    >
                      <View>
                        <Text
                          style={
                            styles.qualityText
                          }
                        >
                          {format.quality}
                        </Text>

                        <Text
                          style={
                            styles.qualitySubtext
                          }
                        >
                          {format.extension.toUpperCase()}
                          {format.filesize
                            ? ` • ${formatFileSize(
                                format.filesize
                              )}`
                            : ''}
                        </Text>
                      </View>

                      <Text
                        style={styles.qualityArrow}
                      >
                        {selectedFormatId === format.formatId ? '✓' : '↓'}
                      </Text>
                    </TouchableOpacity>
                  )
                )
              ) : (
                <Text style={styles.noFormatText}>
                  No downloadable format found.
                </Text>
              )}

              <TouchableOpacity
                style={[
                  styles.downloadButton,
                  (!selectedFormatId || downloading) && styles.disabledButton,
                ]}
                onPress={downloadVideo}
                disabled={!selectedFormatId || downloading}
                activeOpacity={0.8}
              >
                {downloading ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={styles.downloadButtonText}>
                    ↓  Download Video
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          ) : null}

          {/* Supported Platforms */}
          <View style={styles.supportBox}>
            <Text style={styles.supportTitle}>
              Supported Platforms
            </Text>

            <View style={styles.platformRow}>
              <View style={styles.platform}>
                <Text style={styles.platformIcon}>
                  ▶
                </Text>

                <Text style={styles.platformText}>
                  YouTube
                </Text>
              </View>

              <View style={styles.platform}>
                <Text style={styles.platformIcon}>
                  f
                </Text>

                <Text style={styles.platformText}>
                  Facebook
                </Text>
              </View>

              <View style={styles.platform}>
                <Text style={styles.platformIcon}>
                  ◎
                </Text>

                <Text style={styles.platformText}>
                  Instagram
                </Text>
              </View>

              <View style={styles.platform}>
                <Text style={styles.platformIcon}>
                  ♪
                </Text>

                <Text style={styles.platformText}>
                  TikTok
                </Text>
              </View>
            </View>
          </View>

          {/* Permission Notice */}
          <View style={styles.infoBox}>
            <Text style={styles.infoIcon}>ⓘ</Text>

            <Text style={styles.infoText}>
              Only download videos that you have
              permission to save or that are otherwise
              permitted by the platform.
            </Text>
          </View>
        </View>

        {/* Footer */}
        <Text style={styles.footer}>
          © 2026 Video Downloader
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b0b10',
  },

  scrollContent: {
    flexGrow: 1,
    paddingBottom: 20,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingTop: 18,
    paddingBottom: 16,
  },

  logoBox: {
    width: 52,
    height: 52,
    borderRadius: 15,
    backgroundColor: '#6c5ce7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 13,
  },

  logoIcon: {
    color: '#ffffff',
    fontSize: 31,
    fontWeight: '800',
  },

  headerText: {
    flex: 1,
  },

  title: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '800',
  },

  subtitle: {
    color: '#858591',
    fontSize: 12,
    marginTop: 3,
  },

  main: {
    width: '100%',
    maxWidth: 650,
    alignSelf: 'center',
    paddingHorizontal: 22,
    paddingTop: 12,
  },

  welcome: {
    color: '#ffffff',
    fontSize: 29,
    lineHeight: 36,
    fontWeight: '800',
    textAlign: 'center',
  },

  description: {
    color: '#92929d',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginTop: 10,
    marginBottom: 25,
  },

  inputBox: {
    minHeight: 58,
    backgroundColor: '#17171f',
    borderWidth: 1,
    borderColor: '#292934',
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
  },

  linkIcon: {
    fontSize: 19,
    marginRight: 10,
  },

  input: {
    flex: 1,
    color: '#ffffff',
    fontSize: 15,
    paddingVertical: 14,
  },

  analyzeButton: {
    height: 58,
    backgroundColor: '#6c5ce7',
    borderRadius: 16,
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },

  disabledButton: {
    opacity: 0.7,
  },

  analyzeText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
  },

  arrow: {
    color: '#ffffff',
    fontSize: 22,
    marginLeft: 10,
  },

  message: {
    color: '#c6c6cf',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 14,
    fontWeight: '600',
  },

  resultCard: {
    backgroundColor: '#17171f',
    borderWidth: 1,
    borderColor: '#292934',
    borderRadius: 18,
    padding: 18,
    marginTop: 16,
  },

  resultTitle: {
    color: '#8b8b96',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    textAlign: 'center',
    marginBottom: 14,
  },

  thumbnail: {
    width: '100%',
    height: 190,
    borderRadius: 14,
    backgroundColor: '#101017',
  },

  videoTitle: {
    color: '#ffffff',
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '800',
    marginTop: 15,
  },

  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: '#292934',
  },

  detailLabel: {
    color: '#858591',
    fontSize: 13,
  },

  detailValue: {
    color: '#e7e7ed',
    fontSize: 13,
    fontWeight: '700',
    maxWidth: '55%',
  },

  qualityTitle: {
    color: '#d7d7df',
    fontSize: 14,
    fontWeight: '800',
    marginTop: 17,
    marginBottom: 10,
  },

  qualityButton: {
    minHeight: 58,
    backgroundColor: '#1d1d27',
    borderWidth: 1,
    borderColor: '#30303b',
    borderRadius: 13,
    marginBottom: 9,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  selectedQualityButton: {
    borderColor: '#8d7df2',
    backgroundColor: '#29233f',
  },

  downloadButton: {
    minHeight: 52,
    backgroundColor: '#6d5ce7',
    borderRadius: 13,
    marginTop: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },

  downloadButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },

  qualityText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },

  qualitySubtext: {
    color: '#858591',
    fontSize: 11,
    marginTop: 3,
  },

  qualityArrow: {
    color: '#8d7df2',
    fontSize: 22,
    fontWeight: '800',
  },

  noFormatText: {
    color: '#858591',
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 10,
  },

  supportBox: {
    backgroundColor: '#121219',
    borderWidth: 1,
    borderColor: '#24242e',
    borderRadius: 18,
    marginTop: 24,
    padding: 17,
  },

  supportTitle: {
    color: '#d7d7df',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 14,
  },

  platformRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },

  platform: {
    width: '48%',
    minHeight: 54,
    backgroundColor: '#1a1a23',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 9,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },

  platformIcon: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '800',
    width: 30,
    textAlign: 'center',
  },

  platformText: {
    color: '#c6c6cf',
    fontSize: 13,
    marginLeft: 5,
  },

  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 17,
    paddingHorizontal: 3,
  },

  infoIcon: {
    color: '#777783',
    fontSize: 17,
    marginRight: 8,
  },

  infoText: {
    flex: 1,
    color: '#777783',
    fontSize: 11,
    lineHeight: 17,
  },

  footer: {
    color: '#555560',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 18,
    paddingBottom: 5,
  },
});