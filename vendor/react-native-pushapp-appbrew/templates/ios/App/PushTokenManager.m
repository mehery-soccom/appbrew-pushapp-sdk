//
//  PushTokenManager.m
//

#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface RCT_EXTERN_MODULE(PushTokenManager, RCTEventEmitter)
RCT_EXTERN_METHOD(sendPushToken:(NSString *)type token:(NSString *)token)
RCT_EXTERN_METHOD(showForegroundNotification:(NSDictionary *)payload)
RCT_EXTERN_METHOD(getLastToken:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
@end
