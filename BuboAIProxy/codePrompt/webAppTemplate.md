# 分离技术组件与业务组件的 Prompt 模板

请使用以下 prompt 指导 AI 开发一个基于 **技术组件框架** 的 Web 应用，该框架将与具体的 **业务组件** 解耦，便于后续快速构建不同业务场景的应用。

---

## 【技术组件框架】异步任务处理引擎（基于 Tailwind + IndexedDB）

### 一、框架目标
构建一个可复用的**异步任务处理引擎**，提供完整的任务生命周期管理（提交、轮询、持久化、恢复、取消、重试），并通过清晰的接口与业务组件解耦。技术组件应稳定可靠，业务组件只需适配接口即可快速构建完整应用。

### 二、技术栈要求
- **核心语言**：纯 JavaScript (ES6+)
- **UI 样式**：Tailwind CSS (通过 CDN 引入)
- **数据存储**：IndexedDB
- **架构原则**：技术组件与业务组件严格分离，通过事件或回调通信

---

## 第一部分：技术核心组件（稳定层）

### 1. 核心服务模块 (`core/services/`)

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

#### 1.3 API 代理接口 (`ApiProxy`)
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

## 第二部分：业务组件示例（可变层）

### 业务场景：文本处理任务
本示例展示如何基于技术框架构建具体的业务应用。

### 1. 业务 API 实现
```javascript
// 实现 BuboAIProxy 接口
const TextProcessingAPI = {
  async submitTask(input) {
    // 实际调用后端API，返回 { uuid: "req_xxx" }
    const response = await fetch('/api/process-text', {
      method: 'POST',
      body: JSON.stringify({ text: input })
    });
    const data = await response.json();
    return { requestId: data.uuid };
  },
  
  async queryStatus(requestId) {
    const response = await fetch(`/api/status/${requestId}`);
    const data = await response.json();
    return data.status; // 'pending' | 'completed' | 'failed'
  },
  
  async fetchResult(requestId) {
    const response = await fetch(`/api/result/${requestId}`);
    return await response.json();
  }
}
```

### 2. 业务 UI 组件

#### 2.1 业务表单组件 (`TextSubmissionForm`)
```javascript
- 渲染输入框和提交按钮
- 处理用户输入验证
- 调用 TaskManager.createTask(businessType, input)
- 提交后清空表单并显示成功提示
```

#### 2.2 业务任务列表组件 (`TaskList`)
```javascript
- 从 TaskManager 获取任务列表（可过滤特定 businessType）
- 渲染任务卡片，包含：
  - 任务输入摘要（如文本前20字符）
  - 状态徽章（使用 Tailwind 颜色类）
  - 处理结果/错误信息
  - 操作按钮（重试、取消、查看详情）
- 提供筛选/折叠功能（如只显示未完成任务）
- 监听 TaskEvents 自动刷新
```

#### 2.3 业务详情组件 (`TaskDetailsModal`)
```javascript
- 点击任务列表项弹出模态框
- 展示完整的任务信息（输入全文、完整结果、时间戳、重试历史等）
- 提供复制结果、重新提交等功能
```

### 3. 业务配置
```javascript
const BusinessConfig = {
  name: '文本处理',
  businessType: 'text-processing',
  api: TextProcessingAPI,
  ui: {
    formComponent: TextSubmissionForm,
    listComponent: TaskList,
    detailComponent: TaskDetailsModal,
    labels: {
      inputPlaceholder: '请输入要处理的文本...',
      submitButton: '开始处理',
      retryButton: '重试',
      cancelButton: '取消',
      viewDetails: '查看详情'
    }
  }
}
```

---

## 第三部分：应用组装

### 主应用入口 (`app.js`)
```javascript
// 1. 初始化技术组件
const storage = new StorageService();
const taskManager = new TaskManager(storage, BusinessConfig.api);

// 2. 注册业务组件
const textBusiness = new BusinessModule(BusinessConfig, taskManager);

// 3. 渲染UI
document.getElementById('app').innerHTML = `
  <div class="container mx-auto p-4">
    <h1 class="text-2xl font-bold mb-4">${BusinessConfig.name}</h1>
    <div id="form-container"></div>
    <div id="list-container" class="mt-8"></div>
  </div>
`;

textBusiness.mount({
  formContainer: '#form-container',
  listContainer: '#list-container'
});

// 4. 恢复未完成任务
taskManager.recoverTasks(BusinessConfig.businessType);
```

---

## 【如何使用本模板创建新业务应用】

### 步骤1：复制技术框架（稳定不变）
保留所有核心服务模块 (`TaskManager`, `StorageService`, 事件系统)

### 步骤2：实现业务 API
根据后端接口实现 `BuboAIProxy` 接口的三个方法

### 步骤3：定义业务数据模型
扩展基础任务模型，添加业务特定字段：
```javascript
// 例如：图片处理业务
{
  ...baseTask,
  businessFields: {
    imageUrl: string,
    filterType: string,
    outputFormat: string
  }
}
```

### 步骤4：创建业务 UI 组件
根据业务需求设计表单和列表展示方式

### 步骤5：组装应用
参考第三部分代码，注入业务配置

---

## 业务层示例：图片处理应用

### 业务配置示例
```javascript
const ImageProcessingConfig = {
  name: '图片处理',
  businessType: 'image-processing',
  api: {
    async submitTask(input) {
      const formData = new FormData();
      formData.append('image', input.file);
      formData.append('filter', input.filter);
      const response = await fetch('/api/process-image', {
        method: 'POST',
        body: formData
      });
      return { requestId: (await response.json()).taskId };
    },
    async queryStatus(requestId) {
      const response = await fetch(`/api/image-status/${requestId}`);
      return (await response.json()).state;
    },
    async fetchResult(requestId) {
      const response = await fetch(`/api/image-result/${requestId}`);
      return await response.blob(); // 返回图片二进制数据
    }
  },
  ui: {
    formComponent: ImageUploadForm, // 包含文件选择和滤镜选项
    listComponent: ImageGallery,     // 以网格展示处理后的图片
    detailComponent: ImagePreview,   // 大图预览模式
    labels: {
      inputPlaceholder: '选择图片...',
      submitButton: '处理图片',
      retryButton: '重新处理',
      cancelButton: '取消处理',
      viewDetails: '预览'
    }
  }
}
```

---

## 交付要求
1. 提供完整的技术组件框架代码（核心服务模块）
2. 提供一个完整的业务示例（文本处理应用）
3. 代码结构清晰，技术组件与业务组件严格分离
4. 包含详细的注释说明扩展点
5. 实现所有基础功能：任务提交、轮询、持久化、恢复、取消、重试
6. UI 使用 Tailwind CSS 实现响应式设计

---

## 注意事项
- 技术组件不应包含任何业务特定的逻辑或 UI 展示
- 业务组件通过事件监听技术组件的状态变更
- 所有 IndexedDB 操作需正确处理异步和事务
- 轮询机制需支持多任务并发且互不干扰
- 提供模拟 API 实现用于测试（基于 setTimeout）

请根据以上架构生成完整的 Web 应用代码，包含清晰的技术/业务分层设计。