//
//  DeliveryActivityBundle.swift
//  DeliveryActivity
//

import WidgetKit
import SwiftUI

@main
struct DeliveryActivityBundle: WidgetBundle {
    var body: some Widget {
        // Lock Screen / Dynamic Island Live Activity used by PushApp.
        DeliveryActivityLiveActivity()
    }
}
