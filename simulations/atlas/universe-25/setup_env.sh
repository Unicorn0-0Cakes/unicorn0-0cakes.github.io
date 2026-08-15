#!/bin/bash

# 💡 Define your desired Python version
PY_VERSION="3.10.13"
ENV_NAME="env"

echo "🔍 Checking for pyenv..."
if ! command -v pyenv &> /dev/null; then
    echo "❌ pyenv not found. Installing with Homebrew..."
    brew install pyenv
fi

echo "✅ pyenv is available."

# 🔁 Configure shell for pyenv if not already done
echo "🧪 Ensuring pyenv is loaded in your shell..."
if ! grep -q 'pyenv init' ~/.zshrc; then
    echo 'export PYENV_ROOT="$HOME/.pyenv"' >> ~/.zshrc
    echo 'export PATH="$PYENV_ROOT/bin:$PATH"' >> ~/.zshrc
    echo 'eval "$(pyenv init --path)"' >> ~/.zprofile
    echo 'eval "$(pyenv init -)"' >> ~/.zshrc
    source ~/.zprofile
    source ~/.zshrc
    echo "✅ Shell configured for pyenv."
fi

# 📦 Install the desired Python version
if ! pyenv versions | grep -q "$PY_VERSION"; then
    echo "📥 Installing Python $PY_VERSION..."
    pyenv install $PY_VERSION
fi

echo "⚙️ Setting global Python version to $PY_VERSION..."
pyenv global $PY_VERSION

echo "🐍 Creating virtual environment '$ENV_NAME'..."
python -m venv $ENV_NAME

echo "🚀 Activating virtual environment..."
source $ENV_NAME/bin/activate

echo "📦 Installing pygame, numpy, and matplotlib..."
pip install --upgrade pip
pip install pygame numpy matplotlib

echo "✅ Setup complete! To activate your environment later, run:"
echo "    source $ENV_NAME/bin/activate"
