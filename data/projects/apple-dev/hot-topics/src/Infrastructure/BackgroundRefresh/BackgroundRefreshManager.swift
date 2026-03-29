import BackgroundTasks
import Foundation

// MARK: - BackgroundRefreshManager

/// 后台刷新调度管理器
final class BackgroundRefreshManager: Sendable {

    // MARK: - Constants

    static let taskIdentifier = "com.hotapp.hottopics.refresh"

    // MARK: - Registration

    static func registerBackgroundTask() {
        BGTaskScheduler.shared.register(
            forTaskWithIdentifier: taskIdentifier,
            using: nil
        ) { task in
            guard let refreshTask = task as? BGAppRefreshTask else {
                return
            }
            handleRefresh(task: refreshTask)
        }
    }

    // MARK: - Scheduling

    static func scheduleNextRefresh() {
        let request = BGAppRefreshTaskRequest(
            identifier: taskIdentifier
        )
        request.earliestBeginDate = Date(
            timeIntervalSinceNow: 30 * 60
        )
        try? BGTaskScheduler.shared.submit(request)
    }

    // MARK: - Private

    private static func handleRefresh(task: BGAppRefreshTask) {
        scheduleNextRefresh()
        task.expirationHandler = {
            task.setTaskCompleted(success: false)
        }
        task.setTaskCompleted(success: true)
    }
}
