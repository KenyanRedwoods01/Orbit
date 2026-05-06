#!/bin/bash
set -e
systemctl stop orbit || true
systemctl disable orbit || true
