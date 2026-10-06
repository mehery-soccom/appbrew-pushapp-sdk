#import "MeheryAppConfig.h"

static NSString *MeheryNonEmptyString(id value) {
  if (value == nil || value == [NSNull null]) {
    return nil;
  }
  NSString *string = [value isKindOfClass:[NSString class]]
      ? (NSString *)value
      : [NSString stringWithFormat:@"%@", value];
  string = [string stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]];
  return string.length > 0 ? string : nil;
}

static void MeheryResolveCredentials(
    NSDictionary *info,
    NSString *appIdKey,
    NSString *appKeyKey,
    NSString *fallbackAppIdKey,
    NSString *fallbackAppKeyKey,
    RCTPromiseResolveBlock resolve,
    RCTPromiseRejectBlock reject,
    NSString *envLabel
) {
  NSString *appId = MeheryNonEmptyString(info[appIdKey]);
  NSString *appKey = MeheryNonEmptyString(info[appKeyKey]);

  if (appId == nil && fallbackAppIdKey != nil) {
    appId = MeheryNonEmptyString(info[fallbackAppIdKey]);
  }
  if (appKey == nil && fallbackAppKeyKey != nil) {
    appKey = MeheryNonEmptyString(info[fallbackAppKeyKey]);
  }

  if (appId == nil) {
    reject(
        @"ERR_MEHERY_APP_ID",
        [NSString stringWithFormat:@"%@ is missing or empty in Info.plist", appIdKey],
        nil);
    return;
  }

  if (appKey == nil) {
    reject(
        @"ERR_MEHERY_APP_KEY",
        [NSString stringWithFormat:@"%@ is missing or empty in Info.plist", appKeyKey],
        nil);
    return;
  }

  resolve(@{
    @"xApiId": appId,
    @"xApiKey": appKey,
    @"environment": envLabel,
  });
}

@implementation MeheryAppConfig

RCT_EXPORT_MODULE();

RCT_EXPORT_METHOD(getCredentials:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  MeheryResolveCredentials(
      [[NSBundle mainBundle] infoDictionary],
      @"MeheryProdAppId",
      @"MeheryProdAppKey",
      @"MeheryAppId",
      @"MeheryAppSecretKey",
      resolve,
      reject,
      @"production");
}

RCT_EXPORT_METHOD(getCredentialsForEnvironment:(NSString *)environment
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  NSDictionary *info = [[NSBundle mainBundle] infoDictionary];
  NSString *env = [[environment lowercaseString] stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]];

  if ([env isEqualToString:@"sandbox"]) {
    MeheryResolveCredentials(
        info,
        @"MeherySandboxAppId",
        @"MeherySandboxAppKey",
        nil,
        nil,
        resolve,
        reject,
        @"sandbox");
    return;
  }

  if ([env isEqualToString:@"development"]) {
    MeheryResolveCredentials(
        info,
        @"MeheryDevAppId",
        @"MeheryDevAppKey",
        nil,
        nil,
        resolve,
        reject,
        @"development");
    return;
  }

  MeheryResolveCredentials(
      info,
      @"MeheryProdAppId",
      @"MeheryProdAppKey",
      @"MeheryAppId",
      @"MeheryAppSecretKey",
      resolve,
      reject,
      @"production");
}

@end
