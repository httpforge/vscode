import type { RequestConfig } from './request-config';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export type Protocol = 'http' | 'graphql' | 'soap' | 'websocket' | 'grpc' | 'socketio' | 'ai' | 'mcp'

export interface ProjectEnvironment {
  id: string
  name: string
  color: string
  sortOrder: number
}

export type Environment = string

export interface EnvVariable {
  id?: string
  key: string
  value: string
  secret?: boolean
}

export interface EnvironmentConfig {
  id: string
  name: string
  color: string
  variables: EnvVariable[]
}

export interface ApiRequest {
  id: string
  name: string
  method: HttpMethod
  url: string
  protocol: Protocol
  folder?: string
  requestConfig?: RequestConfig
}

export interface Project {
  id: string
  name: string
  description: string
  collections: Collection[]
}

export interface Collection {
  id: string
  name: string
  protocol: Protocol
  requests: ApiRequest[]
}

export interface HistoryItem {
  id: string
  method: HttpMethod
  url: string
  status: number
  time: string
}
