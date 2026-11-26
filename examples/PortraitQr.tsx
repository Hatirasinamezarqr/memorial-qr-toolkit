import React, { useState } from 'react';
import { Button, Image, Text, View } from 'react-native';
import { generateMemorialQr } from '../src/index.native';

// Pass a user-selected readable local image and a new revision when bytes change.
export function PortraitQr({ imageUri, revision }: { imageUri: string; revision: string }) {
  const [uri, setUri] = useState<string>();
  const [status, setStatus] = useState('idle');
  const [busy, setBusy] = useState(false);
  async function generate() {
    setBusy(true); setUri(undefined);
    try {
      const result = await generateMemorialQr({ canonicalUrl: 'https://example.com',
        detail: { id: 'sample', portraitUrl: imageUri, portraitIdentity: revision, photoCandidates: [] },
      }, (state) => setStatus(state));
      setUri(result.qrUri);
      setStatus(result.adaptive ? 'ready' : `plain QR: ${result.diagnostics?.fallbackReason ?? 'fallback'}`);
    } catch { setStatus('Could not generate a QR image. Retry.'); }
    finally { setBusy(false); }
  }
  return <View>
    <Button disabled={busy} title={busy ? 'Generating…' : 'Generate QR / retry'} onPress={() => void generate()} />
    <Text accessibilityLiveRegion="polite">{status}</Text>
    {uri ? <Image accessibilityLabel="Generated test QR" source={{ uri }} style={{ width: 300, height: 300 }} /> : null}
  </View>;
}
