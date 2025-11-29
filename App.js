import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

const HOME_URL = 'https://www.google.com/';
const COOKIE_STORAGE_KEY = 'focusbrowser:persistentCookies';
const SESSION_STORAGE_KEY = 'focusbrowser:persistentSession';
const OVERRIDE_STORAGE_KEY = 'focusbrowser:overrideWindow';
const LAST_OVERRIDE_DATE_KEY = 'focusbrowser:lastOverrideDate';
const BANNED_URLS_ENDPOINT = 'https://cdn.bizbazboz.uk/api/v1/focusbrowser/banned_urls.json';
const ENABLE_OVERRIDE = true; // flip to false to hide all override capabilities
const SYNC_STORAGE_SCRIPT = `(() => {
  try {
    if (!window.ReactNativeWebView || !window.ReactNativeWebView.postMessage) {
      return;
    }
    const sessionPayload = {};
    try {
      for (let i = 0; i < sessionStorage.length; i += 1) {
        const key = sessionStorage.key(i);
        sessionPayload[key] = sessionStorage.getItem(key);
      }
    } catch (err) {}
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'storageSync',
      cookies: document.cookie || '',
      session: sessionPayload,
    }));
  } catch (err) {}
})();`;

const buildSearchUrl = (text) => {
  const trimmed = text.trim();
  return trimmed ? `https://www.google.com/search?q=${encodeURIComponent(trimmed)}` : HOME_URL;
};

const formatDisplayUri = (uri) => {
  if (!uri) return '';
  const stripped = uri.replace(/^(https?:\/\/)(www\.)?/i, '');
  return stripped.endsWith('/') ? stripped.slice(0, -1) : stripped;
};

const isLikelyUrl = (text) => {
  if (!text) return false;
  const value = text.trim();
  if (!value || value.includes(' ')) {
    return false;
  }
  if (/^[a-z]+:\/\//i.test(value)) {
    return true;
  }
  return /\./.test(value);
};

const normalizeUrl = (text) => {
  if (!text) return HOME_URL;
  const value = text.trim();
  if (/^[a-z]+:\/\//i.test(value)) {
    return value;
  }
  return `https://${value}`;
};

const escapeForTemplateLiteral = (value = '') =>
  value.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');

const extractHost = (input = '') => {
  try {
    const candidate = input.startsWith('http') ? input : `https://${input}`;
    const { hostname } = new URL(candidate);
    return hostname.replace(/^www\./, '').toLowerCase();
  } catch (e) {
    return input.replace(/^www\./, '').toLowerCase();
  }
};

function FocusBrowserShell() {
  const [searchText, setSearchText] = useState(HOME_URL);
  const [currentUri, setCurrentUri] = useState(HOME_URL);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const [persistedCookies, setPersistedCookies] = useState('');
  const [persistedSession, setPersistedSession] = useState({});
  const inputRef = useRef(null);
  const webViewRef = useRef(null);
  const insets = useSafeAreaInsets();
  const [bannedHosts, setBannedHosts] = useState([]);
  const [blockedUrl, setBlockedUrl] = useState(null);
  const [overrideInfo, setOverrideInfo] = useState(null);
  const [lastOverrideDate, setLastOverrideDate] = useState(null);
  const [tick, setTick] = useState(Date.now());
  const prevOverrideActiveRef = useRef(false);
  const timerTapRef = useRef(0);
  const [loadProgress, setLoadProgress] = useState(0);

  const handleGoHome = useCallback(() => {
    setBlockedUrl(null);
    setCurrentUri(HOME_URL);
    setSearchText(HOME_URL);
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const storedPairs = await AsyncStorage.multiGet([
          COOKIE_STORAGE_KEY,
          SESSION_STORAGE_KEY,
        ]);
        if (!mounted) return;
        const cookieValue = storedPairs.find(([key]) => key === COOKIE_STORAGE_KEY)?.[1] || '';
        const sessionValue = storedPairs.find(([key]) => key === SESSION_STORAGE_KEY)?.[1] || '{}';
        setPersistedCookies(cookieValue);
        try {
          setPersistedSession(JSON.parse(sessionValue));
        } catch (e) {
          setPersistedSession({});
        }
      } catch (e) {
        // ignore storage errors
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);
  
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const response = await fetch(BANNED_URLS_ENDPOINT);
        const json = await response.json();
        if (active && Array.isArray(json)) {
          setBannedHosts(json);
        }
      } catch (e) {
        // ignore fetch errors
      }
    })();
    return () => {
      active = false;
    };
  }, []);
  
  useEffect(() => {
    if (!ENABLE_OVERRIDE) {
      return undefined;
    }
    let mounted = true;
    (async () => {
      try {
        const pairs = await AsyncStorage.multiGet([
          OVERRIDE_STORAGE_KEY,
          LAST_OVERRIDE_DATE_KEY,
        ]);
        if (!mounted) return;
        const overrideRaw = pairs.find(([key]) => key === OVERRIDE_STORAGE_KEY)?.[1];
        const lastDate = pairs.find(([key]) => key === LAST_OVERRIDE_DATE_KEY)?.[1];
        if (overrideRaw) {
          try {
            setOverrideInfo(JSON.parse(overrideRaw));
          } catch (e) {
            setOverrideInfo(null);
          }
        }
        if (lastDate) {
          setLastOverrideDate(lastDate);
        }
      } catch (e) {
        // ignore storage errors
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);
  
  useEffect(() => {
    if (!ENABLE_OVERRIDE) {
      return undefined;
    }
    const timer = setInterval(() => setTick(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, []);

  const bannedHostSet = useMemo(() => {
    const hosts = Array.isArray(bannedHosts) ? bannedHosts : [];
    return new Set(hosts.map((item) => extractHost(item)).filter(Boolean));
  }, [bannedHosts]);

  const currentDayKey = useMemo(() => new Date(tick).toISOString().slice(0, 10), [tick]);
  const overrideActive = ENABLE_OVERRIDE && Boolean(overrideInfo?.expiresAt && overrideInfo.expiresAt > tick);
  const overrideAvailable = ENABLE_OVERRIDE && lastOverrideDate !== currentDayKey;
  const overrideRemainingMs = overrideActive ? Math.max(overrideInfo.expiresAt - tick, 0) : 0;
  const overrideTimerText = useMemo(() => {
    if (!overrideActive) return '';
    const totalSeconds = Math.floor(overrideRemainingMs / 1000);
    const minutes = Math.floor(totalSeconds / 60)
      .toString()
      .padStart(2, '0');
    const seconds = (totalSeconds % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
  }, [overrideActive, overrideRemainingMs]);
  const showProgress = loadProgress > 0 && loadProgress < 1;

  const clearOverrideWindow = useCallback(
    (lockForDay = false) => {
      setOverrideInfo(null);
      setBlockedUrl(null);
      handleGoHome();
      AsyncStorage.removeItem(OVERRIDE_STORAGE_KEY).catch(() => {});
      if (lockForDay) {
        if (lastOverrideDate !== currentDayKey) {
          setLastOverrideDate(currentDayKey);
        }
        AsyncStorage.setItem(LAST_OVERRIDE_DATE_KEY, currentDayKey).catch(() => {});
      }
    },
    [currentDayKey, handleGoHome, lastOverrideDate],
  );

  useEffect(() => {
    if (!ENABLE_OVERRIDE) {
      prevOverrideActiveRef.current = false;
      return;
    }
    const wasActive = prevOverrideActiveRef.current;
    if (wasActive && !overrideActive) {
      clearOverrideWindow(false);
    }
    prevOverrideActiveRef.current = overrideActive;
  }, [overrideActive, clearOverrideWindow]);

  const handleSubmit = () => {
    const trimmed = searchText.trim();
    const nextUri = trimmed
      ? (isLikelyUrl(trimmed) ? normalizeUrl(trimmed) : buildSearchUrl(trimmed))
      : HOME_URL;
    setCurrentUri(nextUri);
    setSearchText(nextUri);
    inputRef.current?.blur();
  };

  const handleNavigationStateChange = (navState) => {
    setCanGoBack(navState.canGoBack);
    setCanGoForward(navState.canGoForward);
    setCurrentUri(navState.url);
    setSearchText(navState.url);
    if (webViewRef.current) {
      webViewRef.current.injectJavaScript(SYNC_STORAGE_SCRIPT);
    }
  };

  const guardNavigationAttempt = useCallback(() => {
    if (overrideActive) {
      return true;
    }
    const candidate = blockedUrl || currentUri;
    if (isUrlBanned(candidate)) {
      setBlockedUrl(candidate);
      return false;
    }
    return true;
  }, [overrideActive, blockedUrl, currentUri, isUrlBanned]);

  const handlePullToRefresh = useCallback(() => {
    if (!guardNavigationAttempt()) {
      return;
    }
    if (webViewRef.current) {
      webViewRef.current.reload();
    }
  }, [guardNavigationAttempt]);

  const handleBack = () => {
    if (!guardNavigationAttempt()) {
      return;
    }
    if (canGoBack && webViewRef.current) {
      webViewRef.current.goBack();
    }
  };

  const handleForward = () => {
    if (!guardNavigationAttempt()) {
      return;
    }
    if (canGoForward && webViewRef.current) {
      webViewRef.current.goForward();
    }
  };

  const handleReload = () => {
    if (!guardNavigationAttempt()) {
      return;
    }
    if (webViewRef.current) {
      webViewRef.current.reload();
    }
  };

  const handleTimerPress = useCallback(() => {
    if (!overrideActive) {
      return;
    }
    const now = Date.now();
    if (now - timerTapRef.current < 350) {
      timerTapRef.current = 0;
      clearOverrideWindow(true);
    } else {
      timerTapRef.current = now;
    }
  }, [overrideActive, clearOverrideWindow]);

  const handleOverride = useCallback(async () => {
    if (!ENABLE_OVERRIDE || !overrideAvailable) {
      return;
    }
    const now = Date.now();
    const nextInfo = {
      date: currentDayKey,
      expiresAt: now + 30 * 60 * 1000,
    };
    setOverrideInfo(nextInfo);
    setLastOverrideDate(currentDayKey);
    try {
      await AsyncStorage.multiSet([
        [OVERRIDE_STORAGE_KEY, JSON.stringify(nextInfo)],
        [LAST_OVERRIDE_DATE_KEY, currentDayKey],
      ]);
    } catch (e) {
      // ignore persistence errors
    }
    if (blockedUrl) {
      setBlockedUrl(null);
      setCurrentUri(blockedUrl);
      setSearchText(blockedUrl);
    }
  }, [overrideAvailable, currentDayKey, blockedUrl]);

  const isUrlBanned = useCallback((url) => {
    const targetHost = extractHost(url);
    return Boolean(targetHost && bannedHostSet.has(targetHost));
  }, [bannedHostSet]);

  const handleShouldStartLoadWithRequest = useCallback((request) => {
    if (isUrlBanned(request.url) && !overrideActive) {
      setBlockedUrl(request.url);
      return false;
    }
    setBlockedUrl(null);
    return true;
  }, [isUrlBanned, overrideActive]);

  const handleWebMessage = useCallback(async (event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data?.type === 'storageSync') {
        const cookies = typeof data.cookies === 'string' ? data.cookies : '';
        const session = typeof data.session === 'object' && data.session !== null ? data.session : {};
        setPersistedCookies(cookies);
        setPersistedSession(session);
        await AsyncStorage.multiSet([
          [COOKIE_STORAGE_KEY, cookies],
          [SESSION_STORAGE_KEY, JSON.stringify(session)],
        ]);
      }
    } catch (e) {
      // ignore malformed messages
    }
  }, []);

  const isSecure = currentUri?.startsWith('https://');
  const androidNavInset = Platform.OS === 'android' && insets.bottom >= 16 ? insets.bottom : 0;
  const topPadding = useMemo(() => {
    const base = Platform.OS === 'android' ? 4 : 0;
    return Math.max(insets.top, 0) + base;
  }, [insets.top]);
  const statusBarProps = Platform.OS === 'android'
    ? { style: 'light', backgroundColor: '#0b0b0f' }
    : { style: 'light' };

  const hydrationScript = useMemo(() => {
    const escapedCookies = escapeForTemplateLiteral(persistedCookies || '');
    const sessionString = JSON.stringify(persistedSession || {});
    return `(() => {
      try {
        const cookieInput = \`${escapedCookies}\`;
        if (cookieInput) {
          cookieInput.split(';').forEach((pair) => {
            const trimmed = pair.trim();
            if (trimmed) {
              document.cookie = trimmed;
            }
          });
        }
        const sessionData = ${sessionString};
        if (sessionData && typeof sessionData === 'object') {
          Object.keys(sessionData).forEach((key) => {
            try {
              sessionStorage.setItem(key, sessionData[key]);
            } catch (e) {}
          });
        }
      } catch (e) {}
    })();`;
  }, [persistedCookies, persistedSession]);

  return (
    <KeyboardAvoidingView
      style={styles.safeArea}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.container}>
        <View style={[styles.topBar, { paddingTop: topPadding }] }>
          <View style={styles.navGroup}>
            <TouchableOpacity
              style={[styles.navButton, !canGoBack && styles.iconButtonDisabled]}
              onPress={handleBack}
              disabled={!canGoBack}
            >
              <FontAwesome5 name="chevron-left" size={16} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.navButton, !canGoForward && styles.iconButtonDisabled]}
              onPress={handleForward}
              disabled={!canGoForward}
            >
              <FontAwesome5 name="chevron-right" size={16} color="#fff" />
            </TouchableOpacity>
          </View>
          <View style={styles.addressBar}>
            {isSecure && <FontAwesome5 name="lock" size={12} color="#9dd67d" />}
            <View style={styles.inputShell}>
              <TextInput
                ref={inputRef}
                value={searchText}
                onChangeText={setSearchText}
                placeholder="Search or enter web address"
                placeholderTextColor="#7d8590"
                style={[styles.input, !inputFocused && styles.hiddenInputText]}
                returnKeyType="search"
                onSubmitEditing={handleSubmit}
                autoCapitalize="none"
                autoCorrect={false}
                clearButtonMode="while-editing"
                onFocus={() => {
                  setInputFocused(true);
                  requestAnimationFrame(() => {
                    const length = searchText.length;
                    inputRef.current?.setNativeProps({ selection: { start: 0, end: length } });
                  });
                }}
                onBlur={() => {
                  setInputFocused(false);
                  setSearchText(currentUri);
                }}
                selectTextOnFocus
                multiline={false}
                textAlign="left"
                textAlignVertical="center"
                scrollEnabled={false}
                caretHidden={!inputFocused}
              />
              {!inputFocused && (
                <TouchableOpacity
                  style={styles.displayOverlay}
                  activeOpacity={1}
                  onPress={() => inputRef.current?.focus()}
                >
                  <Text
                    numberOfLines={1}
                    ellipsizeMode="tail"
                    style={styles.displayText}
                  >
                    {formatDisplayUri(searchText) || 'Search or enter web address'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity style={styles.goButton} onPress={handleSubmit}>
              <FontAwesome5 name="arrow-right" size={12} color="#0b0b0f" />
            </TouchableOpacity>
          </View>
          {overrideActive ? (
            <TouchableOpacity
              style={styles.overrideTimer}
              activeOpacity={0.6}
              onPress={handleTimerPress}
            >
              <FontAwesome5 name="clock" size={13} color="#f5f5f5" />
              <Text style={styles.overrideTimerText}>{overrideTimerText}</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.refreshButton} onPress={handleReload}>
              <FontAwesome5 name="redo" size={16} color="#fff" />
            </TouchableOpacity>
          )}
        </View>
        {showProgress && (
          <View style={styles.progressTrack}>
            <View style={[styles.progressBar, { width: `${Math.round(loadProgress * 100)}%` }]} />
          </View>
        )}
        <WebView
          ref={webViewRef}
          source={{ uri: currentUri }}
          style={[styles.webview, androidNavInset ? { marginBottom: androidNavInset } : null]}
          startInLoadingState
          pullToRefreshEnabled
          onRefresh={handlePullToRefresh}
          sharedCookiesEnabled
          onNavigationStateChange={handleNavigationStateChange}
          injectedJavaScriptBeforeContentLoaded={hydrationScript}
          onMessage={handleWebMessage}
          onShouldStartLoadWithRequest={handleShouldStartLoadWithRequest}
          onLoadProgress={({ nativeEvent }) => setLoadProgress(nativeEvent.progress || 0)}
          onLoadEnd={() => {
            setLoadProgress(1);
          }}
        />
        {blockedUrl && !overrideActive && (
          <View style={styles.blockOverlay} pointerEvents="auto">
            <View style={styles.blockCard}>
              <Text style={styles.blockTitle}>URL Blocked</Text>
              <Text style={styles.blockUrl} numberOfLines={1}>
                {formatDisplayUri(blockedUrl)}
              </Text>
              <Text style={styles.blockMessage}>
                This site is banned on this device.
              </Text>
              <View style={styles.blockActions}>
                {ENABLE_OVERRIDE ? (
                  overrideAvailable ? (
                    <TouchableOpacity style={styles.blockButton} onPress={handleOverride}>
                      <Text style={styles.blockButtonText}>Override for 30 minutes</Text>
                    </TouchableOpacity>
                  ) : (
                    <Text style={styles.blockSubtext}>
                      Override already used today. Try again tomorrow.
                    </Text>
                  )
                ) : (
                  <Text style={styles.blockSubtext}>Override disabled for this build.</Text>
                )}
                <TouchableOpacity style={styles.blockSecondaryButton} onPress={handleGoHome}>
                  <Text style={styles.blockSecondaryText}>Go To Home</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
        <StatusBar {...statusBarProps} />
      </View>
    </KeyboardAvoidingView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <FocusBrowserShell />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0b0b0f',
  },
  container: {
    flex: 1,
    backgroundColor: '#0b0b0f',
  },
  topBar: {
    paddingTop: Platform.OS === 'android' ? 45 : 20,
    paddingHorizontal: 12,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#10111a',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#1f2030',
  },
  navGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  navButton: {
    width: 30,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#1c1d2a',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#2c2d3d',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButton: {
    width: 28,
    height: 24,
    borderRadius: 8,
    backgroundColor: '#1c1d2a',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#2c2d3d',
    alignItems: 'center',
    justifyContent: 'center',
  },
  refreshButton: {
    width: 40,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#1c1d2a',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#2c2d3d',
    alignItems: 'center',
    justifyContent: 'center',
  },
  overrideTimer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#2a2b3d',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#3d3e52',
  },
  overrideTimerText: {
    color: '#f5f5f5',
    fontWeight: '600',
    fontSize: 13,
  },
  iconButtonDisabled: {
    opacity: 0.35,
  },
  addressBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#1c1d2a',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#2c2d3d',
  },
  inputShell: {
    flex: 1,
    height: '100%',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#f5f5f5',
    backgroundColor: 'transparent',
  },
  hiddenInputText: {
    color: 'transparent',
    opacity: 0,
  },
  displayOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  displayText: {
    color: '#f5f5f5',
    fontSize: 16,
  },
  goButton: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#d5d8ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  webview: {
    flex: 1,
  },
  progressTrack: {
    height: 3,
    backgroundColor: '#1c1d2a',
    width: '100%',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#5ac8fa',
  },
  blockOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(11, 11, 15, 0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  blockCard: {
    width: '100%',
    borderRadius: 20,
    backgroundColor: '#151624',
    padding: 24,
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#2a2b3d',
  },
  blockTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  blockUrl: {
    fontSize: 16,
    color: '#a5a6b8',
  },
  blockMessage: {
    fontSize: 15,
    color: '#d5d6e2',
  },
  blockSubtext: {
    fontSize: 14,
    color: '#9b9cb2',
  },
  blockActions: {
    marginTop: 8,
    gap: 12,
  },
  blockButton: {
    marginTop: 8,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#f5c14f',
    alignItems: 'center',
    justifyContent: 'center',
  },
  blockButtonText: {
    fontWeight: '600',
    color: '#1b1b1f',
    fontSize: 16,
  },
  blockSecondaryButton: {
    marginTop: 10,
    height: 40,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#3a3b4e',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1f2030',
  },
  blockSecondaryText: {
    color: '#d5d6e2',
    fontSize: 15,
    fontWeight: '600',
  },
});
