import { Platform } from 'react-native';
import Purchases, { type PurchasesPackage } from 'react-native-purchases';

export interface StoreOffer {
  package: PurchasesPackage;
  price: string;
}

function getApiKey(): string | null {
  if (Platform.OS === 'ios') return process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY || null;
  if (Platform.OS === 'android') return process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY || null;
  return null;
}

async function configureForUser(userId: string): Promise<boolean> {
  const apiKey = getApiKey();
  if (!apiKey) return false;

  if (!(await Purchases.isConfigured())) {
    Purchases.configure({ apiKey, appUserID: userId });
  }

  if ((await Purchases.getAppUserID()) !== userId) {
    await Purchases.logIn(userId);
  }

  return true;
}

export async function getStoreOffer(
  productId: string,
  userId: string,
): Promise<StoreOffer | null> {
  try {
    if (!(await configureForUser(userId))) return null;

    const offerings = await Purchases.getOfferings();
    const packages = offerings.current?.availablePackages ?? [];
    const storePackage = packages.find(
      (item) => item.product.identifier === productId,
    );

    if (!storePackage) return null;
    return { package: storePackage, price: storePackage.product.priceString };
  } catch {
    return null;
  }
}

export type StorePurchaseStatus = 'purchased' | 'cancelled' | 'unavailable' | 'error';

export async function purchaseStoreProduct(
  productId: string,
  userId: string,
): Promise<StorePurchaseStatus> {
  const offer = await getStoreOffer(productId, userId);
  if (!offer) return 'unavailable';

  try {
    await Purchases.purchasePackage(offer.package);
    return 'purchased';
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'userCancelled' in error &&
      error.userCancelled === true
    ) {
      return 'cancelled';
    }
    return 'error';
  }
}

export async function restoreStorePurchases(userId: string): Promise<boolean> {
  try {
    if (!(await configureForUser(userId))) return false;
    await Purchases.restorePurchases();
    return true;
  } catch {
    return false;
  }
}