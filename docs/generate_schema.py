#!/usr/bin/env python3
"""LinkedIn Clone — Database Schema Diagram (clean rebuild)."""

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch
from matplotlib.lines import Line2D

# ── Palette ────────────────────────────────────────────────────────────────
MYSQL_HDR    = "#0D47A1"
MYSQL_ALT    = "#DDEEFF"
MYSQL_BORDER = "#1565C0"
MONGO_HDR    = "#1B5E20"
MONGO_ALT    = "#C8E6C9"
MONGO_BORDER = "#2E7D32"
PK_COL   = "#B71C1C"
FK_COL   = "#BF360C"
IDX_COL  = "#01579B"
ROW_COL  = "#212121"
CANVAS   = "#EEF2F9"
MYSQL_BG = "#E8F0FE"
MONGO_BG = "#E8F5E9"
CONN_COL = "#455A64"

ROW_H = 0.295
HDR_H = 0.44
PAD   = 0.12


# ── Helpers ────────────────────────────────────────────────────────────────
def tbl_h(n):
    return HDR_H + n * ROW_H + PAD


def draw_table(ax, x, y_top, title, cols, w=3.7, mongo=False):
    h     = tbl_h(len(cols))
    y_bot = y_top - h
    hdr   = MONGO_HDR    if mongo else MYSQL_HDR
    alt   = MONGO_ALT    if mongo else MYSQL_ALT
    bdr   = MONGO_BORDER if mongo else MYSQL_BORDER

    # Shadow
    ax.add_patch(FancyBboxPatch((x+0.07, y_bot-0.07), w, h,
        boxstyle="round,pad=0.04", fc="#BBBBBB", ec="none", zorder=1))
    # Body
    ax.add_patch(FancyBboxPatch((x, y_bot), w, h,
        boxstyle="round,pad=0.04", fc="#FFFFFF", ec=bdr, lw=1.6, zorder=2))
    # Header
    ax.add_patch(FancyBboxPatch((x, y_top-HDR_H), w, HDR_H,
        boxstyle="round,pad=0.04", fc=hdr, ec=bdr, lw=1.6, zorder=3))
    ax.text(x+w/2, y_top-HDR_H/2, title,
        ha="center", va="center", color="white",
        fontsize=9.5, fontweight="bold", zorder=4)

    for i, col in enumerate(cols):
        cy = y_top - HDR_H - PAD/2 - (i+0.5)*ROW_H
        if i % 2 == 0:
            ax.add_patch(FancyBboxPatch(
                (x+0.04, cy-ROW_H/2+0.015), w-0.08, ROW_H-0.03,
                boxstyle="square,pad=0", fc=alt, ec="none", zorder=2.5))

        if   col.startswith("PK "): tag, lbl, c = "PK", col[3:], PK_COL
        elif col.startswith("FK "): tag, lbl, c = "FK", col[3:], FK_COL
        elif col.startswith("• "):  tag, lbl, c = " •", col[2:], IDX_COL
        else:                       tag, lbl, c = "  ", col,     ROW_COL

        ax.text(x+0.14, cy, tag, ha="left", va="center",
            fontsize=7, fontweight="bold", color=c,
            fontfamily="monospace", zorder=4)
        ax.text(x+0.50, cy, lbl, ha="left", va="center",
            fontsize=7.5, color=c, zorder=4)

    return dict(
        x=x, xr=x+w, w=w,
        yt=y_top, yb=y_bot, ym=(y_top+y_bot)/2,
        top=(x+w/2, y_top),   bot=(x+w/2, y_bot),
        lft=(x,     (y_top+y_bot)/2),
        rgt=(x+w,   (y_top+y_bot)/2),
        lft_t=(x,   y_top-HDR_H*0.6),
        rgt_t=(x+w, y_top-HDR_H*0.6),
    )


def col_place(ax, x, y_top, y_bot, items, w, mongo=False):
    """Place tables filling y_top→y_bot with even gaps."""
    total_h = sum(tbl_h(len(c)) for _, c in items)
    n_gaps  = len(items) - 1
    avail   = y_top - y_bot
    gap     = max((avail - total_h) / max(n_gaps, 1), 0.4)

    out, y = {}, y_top
    for name, cols in items:
        out[name] = draw_table(ax, x, y, name, cols, w=w, mongo=mongo)
        y -= tbl_h(len(cols)) + gap
    return out


def arrow(ax, p1, p2, col=CONN_COL, rad=0.0):
    ax.annotate("", xy=p2, xytext=p1,
        arrowprops=dict(
            arrowstyle="-|>", color=col, lw=1.15,
            connectionstyle=f"arc3,rad={rad}",
            shrinkA=5, shrinkB=5),
        zorder=1)


# ── Canvas ─────────────────────────────────────────────────────────────────
FW, FH = 26, 20
fig = plt.figure(figsize=(FW, FH), facecolor=CANVAS)
ax  = fig.add_axes([0, 0, 1, 1])
ax.set_xlim(0, FW)
ax.set_ylim(0, FH)
ax.axis("off")

Y_TOP = 19.0
Y_BOT = 1.2

# ── Section backgrounds ────────────────────────────────────────────────────
ax.add_patch(FancyBboxPatch((0.3, 0.25), 15.5, 19.5,
    boxstyle="round,pad=0.15", fc=MYSQL_BG, ec=MYSQL_BORDER, lw=2.2, zorder=0))
ax.add_patch(FancyBboxPatch((16.15, 0.25), 9.5, 19.5,
    boxstyle="round,pad=0.15", fc=MONGO_BG, ec=MONGO_BORDER, lw=2.2, zorder=0))

# ── Titles ─────────────────────────────────────────────────────────────────
ax.text(FW/2, 19.72, "LinkedIn Clone — Database Schema",
    ha="center", va="center",
    fontsize=18, fontweight="bold", color="#1A237E")

# MySQL header badge
ax.add_patch(FancyBboxPatch((0.55, 19.05), 5.2, 0.62,
    boxstyle="round,pad=0.06", fc=MYSQL_HDR, ec="none", zorder=5, alpha=0.9))
# Dolphin icon — two overlapping circles + a small oval "fin"
ax.add_patch(plt.Circle((1.00, 19.36), 0.20, fc="#29B6F6", ec="white", lw=1.2, zorder=7))
ax.add_patch(plt.Circle((1.00, 19.36), 0.11, fc=MYSQL_HDR, ec="none", zorder=8))
ax.text(1.45, 19.36, "MySQL", fontsize=11.5, fontweight="bold",
    color="white", va="center", zorder=6)
ax.text(2.7,  19.36, "— System of Record", fontsize=9,
    color="#BBDEFB", va="center", zorder=6)

# MongoDB header badge
ax.add_patch(FancyBboxPatch((16.35, 19.05), 5.4, 0.62,
    boxstyle="round,pad=0.06", fc=MONGO_HDR, ec="none", zorder=5, alpha=0.9))
# Leaf icon — filled green oval tilted like the MongoDB leaf
ax.add_patch(matplotlib.patches.Ellipse((16.82, 19.36), 0.28, 0.44,
    angle=30, fc="#66BB6A", ec="white", lw=1.0, zorder=7))
ax.text(17.22, 19.36, "MongoDB", fontsize=11.5, fontweight="bold",
    color="white", va="center", zorder=6)
ax.text(18.80, 19.36, "— Events & Docs", fontsize=9,
    color="#A5D6A7", va="center", zorder=6)

# ══════════════════════════════════════════════════════════════════════════
# COLUMNS
# ══════════════════════════════════════════════════════════════════════════
W1, W2, W3, WM = 3.65, 4.30, 3.80, 4.55

# ── Col 1: member tables ───────────────────────────────────────────────────
a1 = col_place(ax, 0.6, Y_TOP, Y_BOT, [
    ("members", [
        "PK member_id",
        "email  (UNIQUE)",
        "first_name", "last_name",
        "phone", "location",
        "headline", "about",
        "profile_photo_url",
        "connections_count",
        "created_at", "updated_at",
    ]),
    ("connections", [
        "PK connection_id",
        "user_a", "user_b",
        "status", "requested_by",
        "created_at",
        "UNIQUE (user_a, user_b)",
    ]),
    ("member_skills", [
        "PK member_id",
        "PK skill",
        "FK member_id → members",
    ]),
    ("member_experience", [
        "PK exp_id",
        "FK member_id → members",
        "company", "title",
        "start_date", "end_date",
        "description", "is_current",
    ]),
    ("member_education", [
        "PK edu_id",
        "FK member_id → members",
        "institution", "degree",
        "field", "start_year", "end_year",
    ]),
], w=W1)

# ── Col 2: jobs / applications / threads / messages ────────────────────────
a2 = col_place(ax, 5.05, Y_TOP, Y_BOT, [
    ("jobs", [
        "PK job_id",
        "company_id",
        "FK recruiter_id → recruiters",
        "title", "description",
        "seniority_level", "employment_type",
        "location", "remote_type",
        "salary_range", "status",
        "posted_datetime",
        "views_count", "applicants_count",
    ]),
    ("applications", [
        "PK application_id",
        "FK job_id → jobs",
        "FK member_id → members",
        "resume_url", "resume_text",
        "cover_letter",
        "application_datetime",
        "status",
        "UNIQUE (job_id, member_id)",
    ]),
    ("threads", [
        "PK thread_id",
        "created_at",
    ]),
    ("messages", [
        "PK message_id",
        "FK thread_id → threads",
        "sender_id",
        "message_text", "sent_at",
    ]),
], w=W2)

# ── Col 3: recruiters + supporting ────────────────────────────────────────
a3 = col_place(ax, 10.1, Y_TOP, Y_BOT, [
    ("recruiters", [
        "PK recruiter_id",
        "company_id", "name",
        "email  (UNIQUE)", "phone",
        "company_name",
        "company_industry", "company_size",
        "role", "access_level", "created_at",
    ]),
    ("job_skills", [
        "PK job_id",
        "PK skill",
        "FK job_id → jobs",
    ]),
    ("application_notes", [
        "PK note_id",
        "FK application_id → applications",
        "recruiter_id",
        "note_text", "created_at",
    ]),
    ("thread_participants", [
        "PK thread_id",
        "PK user_id",
        "FK thread_id → threads",
    ]),
    ("processed_events", [
        "PK idempotency_key",
        "processed_at",
    ]),
    ("outbox_events", [
        "PK id  (UUID)",
        "topic",
        "envelope  (JSON)",
        "created_at", "sent",
    ]),
], w=W3)

# ── MongoDB column ─────────────────────────────────────────────────────────
am = col_place(ax, 16.5, Y_TOP, Y_BOT, [
    ("events", [
        "• event_type",
        "• actor_id",
        "• entity.entity_id",
        "• idempotency_key  (unique)",
        "trace_id", "timestamp", "payload",
    ]),
    ("ai_traces", [
        "• task_id  (unique)",
        "• trace_id",
        "• status + created_at",
        "model", "prompt", "response",
    ]),
    ("resumes", [
        "• member_id",
        "resume_text",
        "file_url", "uploaded_at",
    ]),
    ("profile_views", [
        "• member_id",
        "• viewed_at",
        "viewer_id", "source",
    ]),
], w=WM, mongo=True)

# ══════════════════════════════════════════════════════════════════════════
# CONNECTORS  — edge-to-edge only, no overshoot
# ══════════════════════════════════════════════════════════════════════════

# jobs → recruiters  (col2 right → col3 left, same row)
arrow(ax, a2["jobs"]["rgt_t"],       a3["recruiters"]["lft_t"],
    col=MYSQL_BORDER, rad=0.0)

# applications → jobs  (within col2, bottom of jobs to top of applications)
arrow(ax, a2["applications"]["top"], a2["jobs"]["bot"],
    col=MYSQL_BORDER, rad=0.0)

# applications → members  (col2 left → col1 right)
arrow(ax, a2["applications"]["lft"], a1["members"]["rgt"],
    col=CONN_COL, rad=0.18)

# job_skills → jobs  (col3 left → col2 right)
arrow(ax, a3["job_skills"]["lft"],   a2["jobs"]["rgt"],
    col=CONN_COL, rad=-0.2)

# application_notes → applications  (col3 left → col2 right)
arrow(ax, a3["application_notes"]["lft"], a2["applications"]["rgt"],
    col=CONN_COL, rad=-0.15)

# messages → threads  (within col2)
arrow(ax, a2["messages"]["top"],     a2["threads"]["bot"],
    col=MYSQL_BORDER, rad=0.0)

# thread_participants → threads  (col3 left → col2 right)
arrow(ax, a3["thread_participants"]["lft"], a2["threads"]["rgt"],
    col=CONN_COL, rad=-0.2)

# ── Legend ─────────────────────────────────────────────────────────────────
lx, ly = 0.7, 0.78
ax.text(lx, ly, "Legend:", fontsize=9, fontweight="bold", color="#333")
for i, (tag, col, desc) in enumerate([
    ("PK", PK_COL,  "Primary Key"),
    ("FK", FK_COL,  "Foreign Key"),
    (" •", IDX_COL, "MongoDB Index"),
]):
    bx = lx + 1.3 + i * 3.5
    ax.text(bx, ly, tag, fontsize=8, fontweight="bold",
        color=col, fontfamily="monospace")
    ax.text(bx+0.38, ly, f"= {desc}", fontsize=8, color="#444")

ax.annotate("", xy=(lx+12.2, ly), xytext=(lx+11.1, ly),
    arrowprops=dict(arrowstyle="-|>", color=CONN_COL, lw=1.2))
ax.text(lx+12.4, ly, "= FK relationship", fontsize=8, color="#444", va="center")

# ── Save ───────────────────────────────────────────────────────────────────
out = "/Users/sharanp/Distributed System/linkedinclone/docs/schema_diagram.png"
plt.savefig(out, dpi=200, bbox_inches="tight",
    facecolor=CANVAS, edgecolor="none")
print(f"Saved → {out}")
