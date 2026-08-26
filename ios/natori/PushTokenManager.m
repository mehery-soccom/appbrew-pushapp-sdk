//
//  PushTokenManager.m
//  MeheryEventSenderExample
//
//  Created by Ghost-ops721 on 14/08/25.
//

#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface RCT_EXTERN_MODULE(PushTokenManager, RCTEventEmitter)
RCT_EXTERN_METHOD(sendPushToken:(NSString *)type token:(NSString *)token)
RCT_EXTERN_METHOD(showForegroundNotification:(NSDictionary *)payload)
@end
