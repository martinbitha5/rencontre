import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Text, View } from 'react-native';
import { interestIcon } from '@/profileOptions';

// Pictogramme d'un centre d'intérêt : un seul jeu d'icônes au trait, net et
// identique sur iOS et Android (les emojis changeaient de dessin d'un
// téléphone à l'autre).
export function InterestIcon({
  interest,
  size = 16,
  color,
}: {
  interest: string;
  size?: number;
  color: string;
}) {
  return <MaterialCommunityIcons name={interestIcon(interest)} size={size} color={color} />;
}

// Contenu d'une puce : pictogramme puis libellé, sur une ligne.
export function InterestLabel({
  interest,
  color,
  textStyle,
}: {
  interest: string;
  color: string;
  textStyle: object;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <InterestIcon interest={interest} color={color} />
      <Text style={textStyle}>{interest}</Text>
    </View>
  );
}
