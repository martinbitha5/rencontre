import { Image, type ImageProps } from 'expo-image';
import { useState } from 'react';
import { photoUrl } from '@/services/api';

// Photo de profil, en miniature ou en grand.
//
// Une vignette ronde de 40 pixels n'a pas besoin d'une image de 1080 : la
// miniature (400 pixels, une vingtaine de Ko) est environ dix fois plus
// légère. Chaque photo envoyée depuis l'app a sa miniature à côté d'elle
// (services/api, uploadPhoto). Les photos plus anciennes n'en ont pas
// encore : si la miniature manque, on bascule sur la photo en grand, sans
// trou à l'écran. Le propriétaire la crée au passage la prochaine fois
// qu'il ouvre l'app (ensureMyThumbs).
type Props = Omit<ImageProps, 'source'> & {
  path: string;
  variant?: 'thumb' | 'full';
};

export function Photo({ path, variant = 'thumb', onError, ...rest }: Props) {
  const [failedFor, setFailedFor] = useState<string | null>(null);
  const useThumb = variant === 'thumb' && failedFor !== path;
  return (
    <Image
      cachePolicy="memory-disk"
      {...rest}
      source={{ uri: photoUrl(path, useThumb ? 'thumb' : 'full') }}
      onError={(e) => {
        if (useThumb) setFailedFor(path);
        else onError?.(e);
      }}
    />
  );
}
