from fastapi import APIRouter

from app.api import auth, users, tenants, plans, subscriptions, projects, tasks, llm, admin

__all__ = [
    "auth",
    "users",
    "tenants",
    "plans",
    "subscriptions",
    "projects",
    "tasks",
    "llm",
    "admin"
]
