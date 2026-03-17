# 总体功能说明
基于如下**技术组件框架** 的单页面Web应用，系统中包括**业务组件**与**技术组件框架**两个部分构成，整体实现与结合AI能力的知识卡片复习/练习的web应用。
其中：【技术组件框架】异步任务处理引擎（基于 Tailwind + IndexedDB）构建，包括：
1.一个可复用的**异步任务处理引擎**，提供完整的任务生命周期管理（提交、轮询、持久化、恢复、取消、重试），并通过清晰的接口与业务组件解耦。技术组件应稳定可靠，业务组件只需适配接口即可快速构建完整应用。
2.技术栈要求
- **核心语言**：纯 JavaScript (ES6+)
- **UI 样式**：Tailwind CSS (通过 CDN 引入)
- **数据存储**：IndexedDB

## 第一部分：技术核心组件
#### 1.1 任务管理器 (`TaskManager`)
```javascript
// 职责：任务生命周期管理、轮询控制、状态同步
- 创建任务 (createTask)
- 启动轮询 (startPolling)
- 取消轮询 (cancelPolling)
- 恢复未完成任务 (recoverTasks)
- 重试失败任务 (retryTask)
```
#### 1.2 存储服务 (`StorageService`)
```javascript
// 职责：IndexedDB 封装，提供标准 CRUD 接口
- 初始化数据库 (initDB)
- 保存任务 (saveTask)
- 更新任务 (updateTask)
- 查询任务 (getTask, getAllTasks)
- 删除任务 (deleteTask)
```

#### 1.3 API 代理接口 (`ApiProxy`)，底层通过BuboAIProxy提供的API与Gemini，deepseek等大模型AI服务通讯
```javascript
// 职责：定义与后端通信的标准接口（由业务层实现具体逻辑）
interface BuboAIProxy {
  submitTask(input: any): Promise<{ requestId: string }>;
  queryStatus(requestId: string): Promise<string>; // 'pending' | 'processing' | 'completed' | 'failed'
  fetchResult(requestId: string): Promise<any>;
  cancelTask?(requestId: string): Promise<void>; // 可选
}
```

### 2. 任务数据模型标准
```javascript
// 所有任务必须包含以下标准字段
{
  id?: number,           // 自增主键
  requestId: string,     // 唯一请求ID，由AI Proxy生成
  businessType: string,  // 业务类型标识（用于区分不同业务）
  input: any,            // 业务输入参数
  status: 'pending' | 'processing' | 'done' | 'failed' | 'cancelled',
  result: any,           // 业务处理结果
  error: string,         // 错误信息
  createdAt: number,     // 时间戳
  updatedAt: number,     // 时间戳
  retryCount: number,    // 重试次数
  pollingConfig: {       // 轮询配置
    interval: number,    // 当前间隔
    maxInterval: number, // 最大间隔(10s)
    timeout: number,     // 超时时间(5min)
    attempts: number     // 已尝试次数
  }
}
```

### 3. 事件系统
```javascript
// 技术组件通过事件通知业务组件状态变更
const TaskEvents = {
  TASK_CREATED: 'task:created',
  TASK_UPDATED: 'task:updated',
  TASK_COMPLETED: 'task:completed',
  TASK_FAILED: 'task:failed',
  TASK_CANCELLED: 'task:cancelled',
  BULK_UPDATE: 'tasks:bulk-update' // 用于批量刷新UI
}
```

---

## 第二部分：业务组件
### 业务功能--知识卡片复习
1.知识卡片的JSON数据结构包括title(问题式title，必选项)，content(答案式content,以markdown格式表述，必选项)，quiz(练习题数组，包括一个到多个练习题，可选项，以JSON格式表述)，以及创建时间，最后更新时间，标签等属性
2.知识卡片可以进行复习/练习，整体复习过程包括三个阶段：阶段1，展示问题，要求学生回忆内容，然后展现结果给学生，学生可以对结果进行进一步记忆，学生可以在这个阶段随时选择进入第二阶段；第二阶段：复习知识卡片的过程是提问/挑战式交互式的复习过程，包括提出问题->学生输入答案->AI给出评价->学生进一步复习->AI给出评价->...直到学生自我感觉掌握知识卡片并选择Quiz练习测试掌握程度后进入Quiz化复习阶段，在Quiz阶段通过一系列的Quiz与答复到完成Quiz并系统评分（部分题目可以直接给出评分，部分题目则可能提交AI进行评分）之后根据Quiz结果最终给出知识卡片的掌握程度并记录结果
3.技术约束：知识卡片数据存储在IndexedDB中，知识卡片复习记录也存储在IndexedDB中但是这两部分数据分开表格存储，知识卡片复习记录包括复习阶段，复习时间，复习结果等信息

### 业务功能--知识卡片管理
1.知识卡片可以进行创建，编辑，删除，查询，排序，按照title关键字搜索过滤，按照标签进行分类以及过滤等操作
2.技术约束：知识卡片数据存储在IndexedDB中，知识卡片数据分开表格存储；支持数据的本地JSON文件导入/导出


输出app的文件为/public/appNoteCards.html